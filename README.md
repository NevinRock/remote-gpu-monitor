# Remote GPU Monitor

[简体中文说明](README.zh-CN.md)

A GNOME Shell 51 extension for read-only NVIDIA GPU status over SSH. It adds a compact server-and-GPU icon on the right side of the top panel and a scrollable dropdown with each GPU's sampled utilization, VRAM use, temperature and power. GPU identities come from UUIDs and the list is discovered at every sample.

The extension uses one short-lived SSH query per poll. It has no daemon and does not require local NVIDIA drivers. The remote host needs `nvidia-smi`.

## Requirements for users

- GNOME Shell **51**. Other releases have not been verified. GNOME supplies GJS, GTK4 and libadwaita for the extension and its preferences; users do not need to install them separately on a normal GNOME installation.
- On the local computer: the `ssh`, `setsid` and `kill` commands. On Arch Linux, install missing commands with `sudo pacman -S openssh util-linux`.
- On the remote computer: an NVIDIA driver with a working `nvidia-smi` command.
- A working SSH host alias in `~/.ssh/config`, with noninteractive authentication. A `ProxyJump` route is supported.

No local NVIDIA GPU, local NVIDIA driver, daemon, Python package or npm package is needed. The extension never installs system packages for users.

## Install

Once the extension is approved on [GNOME Extensions](https://extensions.gnome.org/), install it from its page. The website installer compiles the bundled GSettings schema automatically; users do not need build tools. For one-click installation in a browser, Arch users also need `gnome-browser-connector` and the GNOME Shell Integration browser add-on. Neither is required for manual ZIP installation.

To install the ZIP from this repository instead, run:

```sh
./scripts/build.sh
gnome-extensions install --force dist/remote-gpu-monitor@nevinrock.github.io.shell-extension.zip
gnome-extensions enable remote-gpu-monitor@nevinrock.github.io
```

Building from source requires `gnome-extensions` (from GNOME Shell) and `glib-compile-schemas` (from GLib). Log out and back in on Wayland if GNOME still shows old code after an update. Check the installed extension with `gnome-extensions info remote-gpu-monitor@nevinrock.github.io`.

If you previously installed the development build, disable `remote-gpu-monitor@local` before enabling the public UUID. Your SSH aliases and extension preferences remain in the same GSettings schema.

Look for the server-and-GPU icon on the right of the top panel. If no host is configured, open its menu and choose **连接设置…**.

The extension settings include **语言 / Language** and **菜单主题 / Menu theme**. Choose 中文 or English to change both the settings page and the GPU dropdown. The theme choices are 深色 / 浅色 in Chinese and Dark / Light in English. The theme changes only this extension's dropdown. Both settings take effect without changing the SSH connection or refresh interval.

The **Website** row in preferences opens the [GitHub repository](https://github.com/NevinRock/remote-gpu-monitor). GNOME Extensions also uses the repository URL from `metadata.json` for its website link.

For development, rebuild the archive, reinstall it, then disable and enable the extension. A Wayland session may require logging out and back in before a newly installed extension is discovered.

## Configure SSH

Create or use a host alias in `~/.ssh/config`:

```sshconfig
Host gateway
    HostName gateway.example.com
    User alice

Host gpu-server
    HostName gpu.internal.example.com
    User alice
    ProxyJump gateway
```

Open **Connection Settings / 连接设置**, enter `gpu-server` as the primary alias, optionally set a fallback alias, and click **Test / 测试**. OpenSSH reads `~/.ssh/config` and handles `ProxyJump`. An optional custom SSH config path and executable are available. Connect in a terminal first to accept and verify a new host key and to establish noninteractive authentication. The monitor requires strict host-key checking and batch mode; it never edits SSH config or credentials.

A fallback route is attempted once if the primary query fails. Each route has a 15-second overall timeout. It can be the same server through another alias; the dropdown identifies the route that supplied the latest valid sample.

## Use

The default base interval is 60 seconds. Battery saving is enabled by default and changes polling to 300 seconds when UPower reports battery power. If UPower is unavailable, the base interval is used. Choose 30, 60, 120 or 300 seconds in the menu or preferences. Disable battery saving to use a fixed interval. Polls never overlap or queue up.

The 2 px **GPU** bar is NVIDIA's sampled `utilization.gpu` and always uses blue. The **显存 / VRAM** bar shows used memory divided by total memory: green below 80%, orange from 80% to below 90%, and red from 90% upward. Memory labels use GiB (MiB / 1024). `—` means the remote sensor did not report a value. The dropdown shows used/total/free VRAM, temperature, power and the time since the last successful sample; copied status includes full GPU UUIDs.

Use **立即刷新** for one immediate query, **暂停刷新** to stop scheduled polling, and **恢复刷新** to query immediately. Pausing cancels a query in progress and keeps its last successful data. **停止监控** also pauses polling. **复制 GPU 状态** copies a human-readable snapshot, including GPU UUIDs. **错误详情** contains the last failure category and a short diagnostic.

A failed query keeps the last successful data and marks it stale. A snapshot is also considered stale when older than the larger of 90 seconds or 2.5 times the active interval. The cache is memory-only, so no stale data is restored after a Shell restart. The extension does not infer GPU ownership or allocate workloads.

## Troubleshooting

- **HOST_KEY_ERROR**: connect in a terminal and verify the host key. Never turn off host-key checking to silence this.
- **AUTHENTICATION_FAILED**: check your SSH agent/key and `BatchMode` compatibility.
- **CONNECTION_FAILED** or **TIMEOUT**: check the alias, VPN, gateway and `ProxyJump` route.
- **NVIDIA_SMI_NOT_FOUND**: check `nvidia-smi` on the remote host's noninteractive PATH.
- **CSV_PARSE_FAILED** or **INVALID_GPU_DATA**: inspect the output of the documented query on the remote host.
- **SSH_NOT_FOUND**: install OpenSSH or set a valid executable path.
- **CONFIGURATION_ERROR**: check alias, config path and helper programs.

One remote query is used per route:

```sh
LC_ALL=C nvidia-smi --query-gpu=index,uuid,name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits
```

## Test

```sh
./scripts/test.sh
```

The tests use fake SSH executables and no GPU server. They cover CSV validation, policy, state transitions, cancellation, timeout and localization. Running them requires GJS. The build script validates and compiles the GSettings schema before packaging.

## Remove

```sh
gnome-extensions disable remote-gpu-monitor@nevinrock.github.io
gnome-extensions uninstall remote-gpu-monitor@nevinrock.github.io
```

If desired, reset extension settings with `gsettings reset-recursively org.gnome.shell.extensions.remote-gpu-monitor` while the schema is still installed. The extension writes no snapshot cache and does not modify SSH configuration. Uninstalling it does not alter SSH sessions or remote jobs.

## Publishing

The source is licensed under [GPL-3.0-or-later](LICENSE). The bundled icon is derived from artwork supplied by the project owner with permission for public distribution. The source artwork in `icons/` and development scripts are excluded from the extension ZIP.

The source repository is [NevinRock/remote-gpu-monitor](https://github.com/NevinRock/remote-gpu-monitor). The upload file is `dist/remote-gpu-monitor@nevinrock.github.io.shell-extension.zip`. Sign in or register at [GNOME Extensions upload](https://extensions.gnome.org/upload/), submit that ZIP, and wait for review. The UUID and repository URL should remain stable after the first public release. Only GNOME Shell 51 is declared supported because that is the tested version.

## Design notes

GNOME Shell hosts the UI and scheduler. GJS starts one short-lived `setsid ssh` process per collection; `setsid` creates an owned process group so timeout and disable signal only that query and its ProxyJump descendants. The `kill` utility is started only for cancellation. OpenSSH multiplexing is disabled for monitor queries. No persistent SSH control socket is created. Process-group cleanup was exercised with a fake child process; behavior with a real ProxyJump route remains to be checked on an authorized server.

The collector reads stdout/stderr asynchronously, limits retained output, and validates a complete CSV snapshot before publishing it. It keeps only the latest valid snapshot in memory. UPower changes are delivered over D-Bus, so no power-state polling loop runs. The GPU list is rendered when the menu opens or while open; closed-menu polls update only the compact indicator.
