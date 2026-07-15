-include .env
export

BINARY_NAME := foxglove-studio
REPO_ROOT   := $(shell cd ../.. && pwd)
SSH         := $(REMOTE_USER)@$(REMOTE_HOST)

# Default MCAP path on the target
REMOTE_MCAP_PATH ?= /data/mcap
# Default downloads path on the target
REMOTE_DOWNLOADS_PATH ?= /data/downloads

# Local dev defaults (override in .env)
LOCAL_MCAP_PATH ?= /data/mcap
LOCAL_PORT ?= 8152
LOCAL_TLS ?= --tls
LOCAL_GENERATE_TOKEN ?= --generate-token

## Local targets

.PHONY: web build build-arm64 run run-local clean desktop-installers

web:
	cd $(REPO_ROOT) && yarn web:build:prod
	rm -rf dist
	cp -r $(REPO_ROOT)/web/.webpack dist

build: web
	CGO_ENABLED=0 go build -o $(BINARY_NAME) .

build-arm64: web
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o $(BINARY_NAME)-arm64 .

desktop-installers:
	cd $(REPO_ROOT)/desktop && npm run build:all
	mkdir -p downloads
	cp $(REPO_ROOT)/desktop/dist/*.dmg $(REPO_ROOT)/desktop/dist/*.exe downloads/ 2>/dev/null || true

run: build
	./$(BINARY_NAME) --mcap-path $(REMOTE_MCAP_PATH) --downloads-path downloads --tls

run-local: build
	./$(BINARY_NAME) --mcap-path $(LOCAL_MCAP_PATH) --port $(LOCAL_PORT) $(LOCAL_TLS) $(LOCAL_GENERATE_TOKEN)

clean:
	rm -f $(BINARY_NAME) $(BINARY_NAME)-arm64
	rm -rf dist

## Remote targets

.PHONY: stop-ssh install-ssh run-ssh

stop-ssh:
	-ssh $(SSH) 'killall -TERM $(BINARY_NAME) 2>/dev/null; sleep 2; killall -KILL $(BINARY_NAME) 2>/dev/null; sleep 1'

install-ssh: build-arm64 stop-ssh
	scp $(BINARY_NAME)-arm64 $(SSH):$(REMOTE_BIN)

deploy-downloads: desktop-installers
	ssh $(SSH) 'mkdir -p $(REMOTE_DOWNLOADS_PATH)'
	scp downloads/* $(SSH):$(REMOTE_DOWNLOADS_PATH)/

run-ssh: install-ssh
	exec ssh -t $(SSH) '$(REMOTE_BIN) \
		--mcap-path $(REMOTE_MCAP_PATH) \
		$$([ -d $(REMOTE_DOWNLOADS_PATH) ] && echo "--downloads-path $(REMOTE_DOWNLOADS_PATH)") \
		--port $(REMOTE_PORT) \
		--tls'
