# Rex

A fork of [Jayveer/Rex](https://github.com/Jayveer/Rex), rewritten in TypeScript/Node.js with cross-platform builds.

Rex extracts DIR and DAR archive files from Metal Gear Solid on the original PlayStation.

## Install

Download the latest binary for your platform from [Releases](https://github.com/oliverfencott/Rex/releases).

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `rex-macos.zip` |
| Linux (x64) | `rex-linux` |
| Windows (x64) | `rex-windows.exe` |

> **Heads up:** This has been barely tested on macOS and not at all on Windows or Linux. If something breaks, you found it first. 🐛

## CLI Usage

### macOS

```sh
# Extract a DAR file
./rex path/to/file.dar

# Extract a DIR file
./rex path/to/stage.dir

# Specify an output directory
./rex path/to/stg_tex1.dar path/to/output
```

After unzipping, you may need to make the binary executable:

```sh
chmod +x rex
```

### Linux

```sh
# Extract a DAR file
./rex path/to/file.dar

# Extract a DIR file
./rex path/to/stage.dir

# Specify an output directory
./rex path/to/stg_tex1.dar path/to/output
```

### Windows

```
REM Extract a DAR file
rex.exe path\to\file.dar

REM Extract a DIR file
rex.exe path\to\stage.dir

REM Specify an output directory
rex.exe path\to\stg_tex1.dar path\to\output
```

You can also drag and drop a file onto the executable.

### All Platforms

```
rex [STAGE.DIR|file.dar] [OUTPUTDIRECTORY]
```

An optional output path can be added at the end. If omitted, files extract to the directory of the input file.

## Note

You may see a warning like:

```
ExperimentalWarning: Single executable application is an experimental feature and might change at any time
```

This is normal. Rex is built with [Node.js Single Executable Applications](https://nodejs.org/docs/latest/api/single-executable-applications.html), which is a recent Node.js feature. The warning is emitted by Node.js itself and can be ignored — it does not affect functionality. To suppress it, set the environment variable `NODE_NO_WARNINGS=1`.

## License

[MIT](LICENSE.md)
