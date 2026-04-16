# GLSD daemon

The Go binary that runs on user machines and connects to GLSD. Open source so you can audit exactly what's running on your machine before installing it.

## Install

```bash
curl -fsSL https://glsd.jtlabs.co/install | sh
```

Then:

```bash
glsd login
glsd start
```

## What it does

- Maintains a persistent websocket connection to the GLSD relay
- Manages local `gsd-2` sessions on your behalf
- Streams session output back to the cloud for cross-device access
- Stores session state in a local write-ahead log (`~/.glsd/`)

## Build from source

```bash
go build -o glsd .
./glsd version
```

## License

MIT — see [LICENSE](./LICENSE).
