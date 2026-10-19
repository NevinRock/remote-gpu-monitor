# Publishing Remote GPU Monitor

## Before the first upload

1. Review the source in the public GitHub repository [`NevinRock/remote-gpu-monitor`](https://github.com/NevinRock/remote-gpu-monitor). `VALIDATION.md`, generated schema files, `dist/` and local tool directories are excluded by `.gitignore`.
2. Keep the UUID `remote-gpu-monitor@nevinrock.github.io`. GNOME identifies the extension by this value; changing it after publication would create a different extension.
3. Confirm that the included source icon can be distributed under the chosen GPL-3.0-or-later project license. The owner has confirmed public distribution rights. The large original artwork stays in the GitHub source; only the 2.2 KB panel icon is in the extension ZIP.
4. Review the code and be prepared to maintain it. GNOME's review guidelines require readable, explainable code and may reject unmaintained generated submissions.

This workspace has no usable Git history because its `.git` directory is read-only. For future changes, clone the GitHub repository into a normal writable directory. A clean source snapshot is also available at `dist/remote-gpu-monitor-source.zip`; it excludes the local validation report, generated schema cache and build output.

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
unzip -t dist/remote-gpu-monitor@nevinrock.github.io.shell-extension.zip
unzip -l dist/remote-gpu-monitor@nevinrock.github.io.shell-extension.zip
```

The ZIP should contain `extension.js`, `prefs.js`, `metadata.json`, `stylesheet.css`, `LICENSE`, `lib/`, the small panel icon and the GSettings XML. It should not contain tests, build scripts, the original artwork or `schemas/gschemas.compiled`.

## Upload

Sign in or register at https://extensions.gnome.org/upload/ and submit `dist/remote-gpu-monitor@nevinrock.github.io.shell-extension.zip`. This is a separate account from GitHub. The upload enters GNOME's review process. The current metadata declares only GNOME Shell 51, the version tested locally.

For later updates, keep the same UUID, update the source repository, rebuild the ZIP and upload a new version. The website assigns its own numeric extension version; do not add a `version` key to `metadata.json`.

Official references: [GNOME Shell extension review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html), [extension development guide](https://gjs.guide/extensions/development/creating.html), [GNOME upload page](https://extensions.gnome.org/upload/).
