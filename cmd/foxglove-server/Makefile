-include .env
export

BINARY_NAME := foxglove-studio
REPO_ROOT   := $(shell cd ../.. && pwd)
SSH         := $(REMOTE_USER)@$(REMOTE_HOST)

# Default MCAP path on the target
REMOTE_MCAP_PATH ?= /data/mcap

## Local targets

.PHONY: web build build-arm64 run clean

web:
	cd $(REPO_ROOT) && yarn web:build:prod
	rm -rf dist
	cp -r $(REPO_ROOT)/web/.webpack dist

build: web
	CGO_ENABLED=0 go build -o $(BINARY_NAME) .

build-arm64: web
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o $(BINARY_NAME)-arm64 .

run: build
	./$(BINARY_NAME) --mcap-path $(REMOTE_MCAP_PATH) --tls

clean:
	rm -f $(BINARY_NAME) $(BINARY_NAME)-arm64
	rm -rf dist

## Remote targets

.PHONY: stop-ssh install-ssh run-ssh

stop-ssh:
	-ssh $(SSH) 'killall -TERM $(BINARY_NAME) 2>/dev/null; sleep 2; killall -KILL $(BINARY_NAME) 2>/dev/null; sleep 1'

install-ssh: build-arm64 stop-ssh
	scp $(BINARY_NAME)-arm64 $(SSH):$(REMOTE_BIN)

run-ssh: install-ssh
	exec ssh -t $(SSH) '$(REMOTE_BIN) \
		--mcap-path $(REMOTE_MCAP_PATH) \
		--port $(REMOTE_PORT) \
		--tls'
