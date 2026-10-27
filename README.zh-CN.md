# Remote GPU Monitor

[English README](README.md)

这是一个适用于 **GNOME Shell 46–51** 的扩展，通过 SSH 读取远程 NVIDIA GPU 状态，在顶栏菜单显示利用率、显存、温度和功耗。扩展支持中文 / English 和深色 / 浅色菜单；它不会在本机安装守护进程，也不要求本机有 NVIDIA 显卡。

## 普通用户需要什么

- 本机运行 GNOME Shell 46–51。目前仅在 51.1 上实机测试；46–50 已参照 GNOME 版本迁移指南检查，尚待实机验证。
- 本机需要 `ssh`、`setsid`、`kill`。
- 远程服务器需要 NVIDIA 驱动和可用的 `nvidia-smi`。
- 配置好 `~/.ssh/config` 中的主机别名和无需交互的 SSH 认证。支持 `ProxyJump`。

从 GNOME Extensions 网站用浏览器一键安装时，还需要 `gnome-browser-connector` 和浏览器里的 GNOME Shell Integration 扩展。手动安装 ZIP 不需要这两项。普通用户也不需要单独安装 GJS、GTK4、libadwaita、Python 或 npm 包；标准 GNOME 环境会提供扩展和设置页所需的 GNOME 库。

## 安装

新 UUID 正式审核通过后，可以从对应的 GNOME Extensions 页面安装。[旧扩展页面](https://extensions.gnome.org/extension/11376/remote-gpu-monitor/) 使用不同 UUID，不会自动更新到新版。

### 在 Ubuntu / Arch Linux 上从源码安装

先运行 `gnome-shell --version`，确认当前桌面版本在 **46–51** 范围内；下面的安装命令不会把不受支持的 GNOME 版本自动升级到该范围。按发行版安装 SSH 工具、打包工具和 Git：

Ubuntu：

```sh
sudo apt update
sudo apt install git gnome-shell openssh-client util-linux procps libglib2.0-bin
```

Arch Linux：

```sh
sudo pacman -Syu git gnome-shell openssh util-linux glib2
```

如果要从 GNOME Extensions 网站通过浏览器安装，还需在 Ubuntu 上运行 `sudo apt install gnome-browser-connector`，或在 Arch Linux 上运行 `sudo pacman -S gnome-browser-connector`，并在浏览器中安装 GNOME Shell Integration 附加组件。若要从本仓库构建并安装 ZIP，则运行：

```sh
git clone https://github.com/NevinRock/remote-gpu-monitor.git
cd remote-gpu-monitor
./scripts/build.sh
gnome-extensions install --force dist/remote-gpu-monitor@_shiki_.shell-extension.zip
gnome-extensions enable remote-gpu-monitor@_shiki_
```

从源码打包需要 GNOME Shell 自带的 `gnome-extensions` 和 GLib 的 `glib-compile-schemas`。在 Wayland 会话中更新扩展代码后，可能需要退出登录并重新登录。用 `gnome-extensions info remote-gpu-monitor@_shiki_` 查看安装状态。

如果以前装过 `remote-gpu-monitor@local` 或 `remote-gpu-monitor@nevinrock.github.io`，请先停用旧扩展，避免两个图标同时运行。GSettings schema ID 没有变化，因此同一台电脑上的 SSH 别名和扩展设置仍可使用。

## 连接设置

在 `~/.ssh/config` 中配置主机别名，例如：

```sshconfig
Host gpu-server
    HostName gpu.example.com
    User alice
```

先在终端运行一次 `ssh gpu-server`，验证主机密钥并确认认证正常。然后打开扩展设置，把 `gpu-server` 填入“主要 SSH 别名”，点击“测试”。远程主机的 `nvidia-smi` 需要能在非交互式 SSH 命令中运行。扩展使用严格主机密钥检查和批处理模式，不修改 SSH 配置或凭据。

扩展会按设置间隔发起一次短连接。GPU 利用率是蓝色细线；显存占用低于 80% 为绿色，80% 起为橙色，90% 起为红色。菜单可以立即刷新、暂停刷新、复制 GPU 状态；只有点击“复制 GPU 状态”时才会写入剪贴板。

设置页中的“网站”可打开 [GitHub 仓库](https://github.com/NevinRock/remote-gpu-monitor)。GNOME Extensions 也会根据 `metadata.json` 中的网址显示 Website 链接。

## 许可证

项目采用 [GPL-3.0-or-later](LICENSE) 许可证。原始图标由项目所有者提供，并允许公开发布；扩展 ZIP 只包含运行所需的小图标。维护者的打包和上传步骤见 [PUBLISHING.md](PUBLISHING.md)。
