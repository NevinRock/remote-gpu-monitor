# Publishing Remote GPU Monitor

## Release checklist

1. Review the source in the public GitHub repository [`NevinRock/remote-gpu-monitor`](https://github.com/NevinRock/remote-gpu-monitor). `VALIDATION.md`, generated schema files, `dist/` and local tool directories are excluded by `.gitignore`.
2. Use the new UUID `remote-gpu-monitor@_shiki_` consistently. GNOME identifies extensions by UUID; the previous `remote-gpu-monitor@nevinrock.github.io` listing is a separate extension.
3. Confirm that the included source icon can be distributed under the chosen GPL-3.0-or-later project license. The owner has confirmed public distribution rights. The large original artwork stays in the GitHub source; only the 2.2 KB panel icon is in the extension ZIP.
4. Review the code and be prepared to maintain it. GNOME's review guidelines require readable, explainable code and may reject unmaintained generated submissions.

## GitHub pull request workflow

Make each update on a branch, then open a pull request against `main`. Review and merge the pull request on GitHub before building and uploading a new GNOME Extensions ZIP.

```sh
git clone git@github.com:NevinRock/remote-gpu-monitor.git
cd remote-gpu-monitor
git switch -c update/describe-change
# Edit files and run ./scripts/test.sh
git add .
git commit -m "Describe the change"
git push -u origin update/describe-change
```

Open the comparison page GitHub shows after the push and choose **Create pull request**. GitHub displays the account that opens the pull request; commits are attributed separately by their author email. Use an email associated with your GitHub account for future commits if you want your profile on those commits.

## Build and check

```sh
./scripts/test.sh
./scripts/build.sh
unzip -t dist/remote-gpu-monitor@_shiki_.shell-extension.zip
unzip -l dist/remote-gpu-monitor@_shiki_.shell-extension.zip
```

The ZIP should contain `extension.js`, `prefs.js`, `metadata.json`, `stylesheet.css`, `LICENSE`, `lib/`, the small panel icon and the GSettings XML. It should not contain tests, build scripts, the original artwork or `schemas/gschemas.compiled`.

## Submit the new UUID

The previous UUID was submitted to [GNOME Extensions](https://extensions.gnome.org/extension/11376/remote-gpu-monitor/). The new UUID is a separate extension: sign in at https://extensions.gnome.org/upload/ and submit the freshly built `dist/remote-gpu-monitor@_shiki_.shell-extension.zip` as a new listing. The GNOME account is separate from GitHub. Each upload enters GNOME's review process. The current metadata declares GNOME Shell 46–51; only 51.1 has been tested locally.

Keep the same UUID for every update. The website assigns its own numeric extension version; do not add a `version` key to `metadata.json`.

Official references: [GNOME Shell extension review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html), [extension development guide](https://gjs.guide/extensions/development/creating.html), [GNOME upload page](https://extensions.gnome.org/upload/).
