# Rex

A fork of [Jayveer/Rex](https://github.com/Jayveer/Rex), rewritten in TypeScript/Node.js with cross-platform builds.

Rex extracts and re-packs DIR and DAR archive files from Metal Gear Solid on the original PlayStation.

## Install

Download the latest binary for your platform from [Releases](https://github.com/oliverfencott/Rex/releases).

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `rex-macos.zip` |
| Linux (x64) | `rex-linux` |
| Windows (x64) | `rex-windows.exe` |

> **Heads up:** This has been barely tested on macOS and not at all on Windows or Linux. If something breaks, you found it first. 🐛

## CLI Usage

All features require an explicit flag. Running `rex` with no flags prints the usage message.

### Extract (`-x`, `--extract`)

Extract a DAR or DIR archive to a directory.

```sh
# Extract a DAR file
rex -x path/to/file.dar

# Extract a DIR file
rex -x path/to/stage.dir

# Specify an output directory
rex -x path/to/file.dar path/to/output
```

### Pack (`-p`, `--pack`)

Re-pack an extracted stage directory back into a `.dir` file. The input directory should contain page subdirectories (as produced by `-x`).

```sh
# Re-pack a directory into a STAGE.DIR file
rex -p path/to/s01a

# Specify an output directory
rex -p path/to/s01a path/to/output
```

If no output path is given, `STAGE.DIR` is written into the input directory.

### Help (`-h`, `--help`)

```sh
rex -h
```

### Platform Notes

After unzipping on macOS/Linux, you may need to make the binary executable:

```sh
chmod +x rex
```

On Windows, you can also drag and drop a file onto the executable, but you must still pass the appropriate flag.

## Note

You may see a warning like:

```
ExperimentalWarning: Single executable application is an experimental feature and might change at any time
```

This is normal. Rex is built with [Node.js Single Executable Applications](https://nodejs.org/docs/latest/api/single-executable-applications.html), which is a recent Node.js feature. The warning is emitted by Node.js itself and can be ignored — it does not affect functionality. To suppress it, set the environment variable `NODE_NO_WARNINGS=1`.

## License

[MIT](LICENSE.md)
