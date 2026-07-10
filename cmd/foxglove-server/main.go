package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/foxglove/mcap/go/mcap"
)

//go:embed dist/*
var staticFiles embed.FS

type McapFileInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
}

type McapFileIndex struct {
	Path      string  `json:"path"`
	Folder    string  `json:"folder"`
	Filename  string  `json:"filename"`
	StartTime float64 `json:"startTime"` // unix seconds
	EndTime   float64 `json:"endTime"`   // unix seconds
	Size      int64   `json:"size"`
}

type indexCacheEntry struct {
	modTime   time.Time
	size      int64
	startTime uint64 // nanoseconds
	endTime   uint64 // nanoseconds
}

var (
	indexCache   = make(map[string]*indexCacheEntry)
	indexCacheMu sync.Mutex
)

// getMcapTimeRange reads the summary section of an MCAP file to extract
// message start/end timestamps. This is O(1) — it seeks to the footer
// without scanning messages.
func getMcapTimeRange(path string) (startNs, endNs uint64, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	reader, err := mcap.NewReader(f)
	if err != nil {
		return 0, 0, fmt.Errorf("mcap reader: %w", err)
	}
	defer reader.Close()

	info, err := reader.Info()
	if err != nil {
		return 0, 0, fmt.Errorf("mcap info: %w", err)
	}

	// Prefer Statistics record
	if info.Statistics != nil && info.Statistics.MessageCount > 0 {
		return info.Statistics.MessageStartTime, info.Statistics.MessageEndTime, nil
	}

	// Fallback: scan ChunkIndex records
	if len(info.ChunkIndexes) > 0 {
		startNs = info.ChunkIndexes[0].MessageStartTime
		endNs = info.ChunkIndexes[0].MessageEndTime
		for _, ci := range info.ChunkIndexes[1:] {
			if ci.MessageStartTime < startNs {
				startNs = ci.MessageStartTime
			}
			if ci.MessageEndTime > endNs {
				endNs = ci.MessageEndTime
			}
		}
		return startNs, endNs, nil
	}

	return 0, 0, fmt.Errorf("no statistics or chunk indexes found")
}

type timestampedMsg struct {
	logTime   uint64
	channelID uint16
	data      []byte
}

// mergeMcapFiles merges multiple MCAP files into a single output file.
// Files are assumed to be roughly sequential. Messages are written in
// log-time order using a simple merge across all source iterators.
func mergeMcapFiles(outputPath string, inputPaths []string) error {
	outFile, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	defer outFile.Close()

	writer, err := mcap.NewWriter(outFile, &mcap.WriterOptions{
		Chunked: true,
	})
	if err != nil {
		return fmt.Errorf("create writer: %w", err)
	}

	if err := writer.WriteHeader(&mcap.Header{Profile: ""}); err != nil {
		return fmt.Errorf("write header: %w", err)
	}

	// Track schema/channel ID remapping across files
	schemaMap := make(map[string]uint16)  // key: sourceFile+origID -> newID
	channelMap := make(map[string]uint16) // key: sourceFile+origID -> newID
	var nextSchemaID uint16 = 1
	var nextChannelID uint16 = 1

	var allMessages []timestampedMsg

	for fileIdx, inputPath := range inputPaths {
		f, err := os.Open(inputPath)
		if err != nil {
			return fmt.Errorf("open %s: %w", inputPath, err)
		}

		reader, err := mcap.NewReader(f)
		if err != nil {
			f.Close()
			return fmt.Errorf("read %s: %w", inputPath, err)
		}

		it, err := reader.Messages()
		if err != nil {
			reader.Close()
			f.Close()
			return fmt.Errorf("messages %s: %w", inputPath, err)
		}

		err = mcap.Range(it, func(schema *mcap.Schema, channel *mcap.Channel, message *mcap.Message) error {
			filePrefix := fmt.Sprintf("%d:", fileIdx)

			// Remap schema
			schemaKey := filePrefix + fmt.Sprintf("%d", schema.ID)
			newSchemaID, ok := schemaMap[schemaKey]
			if !ok {
				newSchemaID = nextSchemaID
				nextSchemaID++
				schemaMap[schemaKey] = newSchemaID
				if err := writer.WriteSchema(&mcap.Schema{
					ID:       newSchemaID,
					Name:     schema.Name,
					Encoding: schema.Encoding,
					Data:     schema.Data,
				}); err != nil {
					return fmt.Errorf("write schema: %w", err)
				}
			}

			// Remap channel
			channelKey := filePrefix + fmt.Sprintf("%d", channel.ID)
			newChannelID, ok := channelMap[channelKey]
			if !ok {
				newChannelID = nextChannelID
				nextChannelID++
				channelMap[channelKey] = newChannelID
				if err := writer.WriteChannel(&mcap.Channel{
					ID:              newChannelID,
					SchemaID:        newSchemaID,
					Topic:           channel.Topic,
					MessageEncoding: channel.MessageEncoding,
					Metadata:        channel.Metadata,
				}); err != nil {
					return fmt.Errorf("write channel: %w", err)
				}
			}

			// Buffer message
			dataCopy := make([]byte, len(message.Data))
			copy(dataCopy, message.Data)
			allMessages = append(allMessages, timestampedMsg{
				logTime:   message.LogTime,
				channelID: newChannelID,
				data:      dataCopy,
			})
			return nil
		})

		reader.Close()
		f.Close()

		if err != nil {
			return fmt.Errorf("iterate %s: %w", inputPath, err)
		}
	}

	// Sort by log time
	sortMessages(allMessages)

	// Write sorted messages
	for i := range allMessages {
		msg := &allMessages[i]
		if err := writer.WriteMessage(&mcap.Message{
			ChannelID:   msg.channelID,
			Sequence:    uint32(i),
			LogTime:     msg.logTime,
			PublishTime: msg.logTime,
			Data:        msg.data,
		}); err != nil {
			return fmt.Errorf("write message: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("close writer: %w", err)
	}
	return nil
}

func sortMessages(msgs []timestampedMsg) {
	sort.Slice(msgs, func(i, j int) bool {
		return msgs[i].logTime < msgs[j].logTime
	})
}

func generateSelfSignedCert() (tls.Certificate, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generate key: %w", err)
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generate serial: %w", err)
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject:      pkix.Name{CommonName: "Foxglove Studio"},
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(5 * 365 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1"), net.IPv6loopback},
		DNSNames:     []string{"localhost"},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("create certificate: %w", err)
	}

	return tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  key,
	}, nil
}

func main() {
	mcapPath := flag.String("mcap-path", "", "Directory containing MCAP files (enables file browser)")
	port := flag.Int("port", 8152, "HTTP server port")
	tlsCert := flag.String("tls-cert", "", "Path to TLS certificate file")
	tlsKey := flag.String("tls-key", "", "Path to TLS private key file")
	useTLS := flag.Bool("tls", false, "Enable HTTPS with auto-generated self-signed certificate")
	flag.Parse()

	var absPath string
	if *mcapPath != "" {
		var err error
		absPath, err = filepath.Abs(*mcapPath)
		if err != nil {
			log.Fatalf("Invalid path: %v", err)
		}

		info, err := os.Stat(absPath)
		if err != nil || !info.IsDir() {
			log.Fatalf("Not a valid directory: %s", absPath)
		}
	}

	mux := http.NewServeMux()

	if absPath != "" {
	// API: list MCAP files
	mux.HandleFunc("/api/mcap/files", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var files []McapFileInfo
		err := filepath.WalkDir(absPath, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			if !strings.HasSuffix(strings.ToLower(d.Name()), ".mcap") {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			relPath, _ := filepath.Rel(absPath, path)
			files = append(files, McapFileInfo{
				Name:    d.Name(),
				Path:    relPath,
				Size:    info.Size(),
				ModTime: info.ModTime().UTC().Format(time.RFC3339),
			})
			return nil
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if files == nil {
			files = []McapFileInfo{}
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(files)
	})

	// API: serve individual MCAP file (supports range requests)
	mux.HandleFunc("/api/mcap/files/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		relPath := strings.TrimPrefix(r.URL.Path, "/api/mcap/files/")
		if relPath == "" {
			http.Error(w, "Missing file path", http.StatusBadRequest)
			return
		}

		// Prevent directory traversal
		cleanPath := filepath.Clean(relPath)
		if strings.Contains(cleanPath, "..") {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		fullPath := filepath.Join(absPath, cleanPath)

		// Verify the file is within the mcap directory
		if !strings.HasPrefix(fullPath, absPath) {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		f, err := os.Open(fullPath)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		defer f.Close()

		stat, err := f.Stat()
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified")
		// http.ServeContent handles Range requests, Content-Length, and Accept-Ranges automatically
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
	})

	// API: index MCAP files (returns start/end timestamps per file)
	mux.HandleFunc("/api/mcap/index", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var results []McapFileIndex
		err := filepath.WalkDir(absPath, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			if !strings.HasSuffix(strings.ToLower(d.Name()), ".mcap") {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}
			relPath, _ := filepath.Rel(absPath, path)

			// Check cache
			indexCacheMu.Lock()
			cached, ok := indexCache[relPath]
			if ok && cached.modTime.Equal(info.ModTime()) && cached.size == info.Size() {
				results = append(results, McapFileIndex{
					Path:      relPath,
					Folder:    filepath.Dir(relPath),
					Filename:  d.Name(),
					StartTime: float64(cached.startTime) / 1e9,
					EndTime:   float64(cached.endTime) / 1e9,
					Size:      info.Size(),
				})
				indexCacheMu.Unlock()
				return nil
			}
			indexCacheMu.Unlock()

			// Read time range from MCAP summary
			startNs, endNs, err := getMcapTimeRange(path)
			if err != nil {
				log.Printf("Warning: could not index %s: %v", relPath, err)
				return nil
			}

			// Update cache
			indexCacheMu.Lock()
			indexCache[relPath] = &indexCacheEntry{
				modTime:   info.ModTime(),
				size:      info.Size(),
				startTime: startNs,
				endTime:   endNs,
			}
			indexCacheMu.Unlock()

			folder := filepath.Dir(relPath)
			if folder == "." {
				folder = ""
			}

			results = append(results, McapFileIndex{
				Path:      relPath,
				Folder:    folder,
				Filename:  d.Name(),
				StartTime: float64(startNs) / 1e9,
				EndTime:   float64(endNs) / 1e9,
				Size:      info.Size(),
			})
			return nil
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if results == nil {
			results = []McapFileIndex{}
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(results)
	})

	// API: merge MCAP files into a single file
	mux.HandleFunc("/api/mcap/merge", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Paths []string `json:"paths"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if len(req.Paths) == 0 {
			http.Error(w, "No files specified", http.StatusBadRequest)
			return
		}

		// Validate all paths are within the mcap directory
		var fullPaths []string
		for _, relPath := range req.Paths {
			cleanPath := filepath.Clean(relPath)
			if strings.Contains(cleanPath, "..") {
				http.Error(w, "Invalid path", http.StatusBadRequest)
				return
			}
			fullPath := filepath.Join(absPath, cleanPath)
			if !strings.HasPrefix(fullPath, absPath) {
				http.Error(w, "Invalid path", http.StatusBadRequest)
				return
			}
			fullPaths = append(fullPaths, fullPath)
		}

		// Create temp file for merged output
		tmpFile, err := os.CreateTemp("", "foxglove-merge-*.mcap")
		if err != nil {
			http.Error(w, "Failed to create temp file", http.StatusInternalServerError)
			return
		}
		tmpPath := tmpFile.Name()
		tmpFile.Close()

		log.Printf("Merging %d files into %s", len(fullPaths), tmpPath)
		startTime := time.Now()

		if err := mergeMcapFiles(tmpPath, fullPaths); err != nil {
			os.Remove(tmpPath)
			log.Printf("Merge failed: %v", err)
			http.Error(w, fmt.Sprintf("Merge failed: %v", err), http.StatusInternalServerError)
			return
		}

		log.Printf("Merge complete in %v", time.Since(startTime))

		// Clean up temp file after 1 hour
		go func() {
			time.Sleep(1 * time.Hour)
			os.Remove(tmpPath)
			log.Printf("Cleaned up temp merge file: %s", tmpPath)
		}()

		// Return the URL to serve the merged file
		mergeID := filepath.Base(tmpPath)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(map[string]string{
			"url": "/api/mcap/merged/" + mergeID,
		})
	})

	// API: serve merged MCAP files
	mux.HandleFunc("/api/mcap/merged/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		mergeID := strings.TrimPrefix(r.URL.Path, "/api/mcap/merged/")
		if mergeID == "" || strings.Contains(mergeID, "/") || strings.Contains(mergeID, "..") {
			http.Error(w, "Invalid merge ID", http.StatusBadRequest)
			return
		}

		tmpPath := filepath.Join(os.TempDir(), mergeID)
		f, err := os.Open(tmpPath)
		if err != nil {
			http.Error(w, "Merged file not found", http.StatusNotFound)
			return
		}
		defer f.Close()

		stat, err := f.Stat()
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
	})
	} // end if absPath != ""

	// Serve embedded static files (the Foxglove web app)
	staticFS, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		log.Fatalf("Failed to create sub filesystem: %v", err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	// Read index.html and optionally inject server mode config
	indexBytes, err := fs.ReadFile(staticFS, "index.html")
	if err != nil {
		log.Fatalf("Failed to read index.html: %v", err)
	}
	indexHTML := string(indexBytes)
	if absPath != "" {
		indexHTML = strings.Replace(
			indexHTML,
			"global = globalThis;",
			`global = globalThis;
      globalThis.FOXGLOVE_STUDIO_SERVER = { apiBase: "" };`,
			1,
		)
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Serve patched index.html for root and SPA routes
		serveIndex := path == "/"
		if !serveIndex {
			cleanPath := strings.TrimPrefix(path, "/")
			if _, err := fs.Stat(staticFS, cleanPath); err != nil {
				serveIndex = true
			}
		}

		if serveIndex {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(indexHTML))
			return
		}

		fileServer.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%d", *port)
	if absPath != "" {
		log.Printf("Serving MCAP files from: %s", absPath)
	}

	if *tlsCert != "" && *tlsKey != "" {
		log.Printf("Foxglove Studio server starting on https://localhost:%d", *port)
		log.Fatal(http.ListenAndServeTLS(addr, *tlsCert, *tlsKey, mux))
	} else if *useTLS {
		cert, err := generateSelfSignedCert()
		if err != nil {
			log.Fatalf("Failed to generate self-signed certificate: %v", err)
		}
		log.Printf("Generated self-signed TLS certificate (valid 1 year, localhost/127.0.0.1)")
		log.Printf("Foxglove Studio server starting on https://localhost:%d", *port)
		server := &http.Server{
			Addr:    addr,
			Handler: mux,
			TLSConfig: &tls.Config{
				Certificates: []tls.Certificate{cert},
			},
		}
		log.Fatal(server.ListenAndServeTLS("", ""))
	} else {
		log.Printf("Foxglove Studio server starting on http://localhost:%d", *port)
		log.Fatal(http.ListenAndServe(addr, mux))
	}
}
