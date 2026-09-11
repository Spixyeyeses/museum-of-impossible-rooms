# Release workflow

The browser implementation and native Unity project live in the same repository. Version identifiers follow Semantic Versioning; Unity previews use a prerelease suffix. The repository version is recorded in VERSION and package.json.

1. Create a feature or release branch from main. Commit Unity Assets with their metadata, Packages, and ProjectSettings. Keep generated caches, local service connections, builds, and credentials out of Git.
2. Run npm test, npm run validate, npm run unity:check, and npm run unity:fixtures:check from the root. CI repeats these dependency-free checks on pushes and pull requests.
3. Open MuseumUnity in Unity 6000.6.0f1. Run Museum.Editor.Tests and Museum.PlayMode.Tests, then build with Museum > Build Windows Player. Run the player with --museum-smoke-test and --museum-visual-audit, and inspect the captured views. Unity tests/builds require a local Editor and are not claimed to run in the Node CI job.
4. Zip the executable with its Data directory, UnityPlayer.dll, MonoBleedingEdge, and other runtime dependencies. Exclude build backups, cache folders, diagnostics, and local logs. Test the extracted package and record SHA-256.
5. Update CHANGELOG.md, VERSION, package.json, evidence, and download links. Review the branch in a pull request; merge after checks pass.
6. Tag the merged source and publish a GitHub prerelease with the Windows ZIP, checksum and verification JSON. Keep preview releases separate from the latest stable browser download. Verify the public asset hashes after upload.

## v1.1.0-unity-preview.1

This release publishes the exact Windows visual-fixes archive tested on September 9; only its filename changes. It preserves the tested player metadata (Unity bundleVersion 0.1.0). The release/tag version is 1.1.0-unity-preview.1. Cloud association identifiers are omitted from the public project; runtime code and rendered assets are unchanged. For the next freshly built release, set Player Settings > Version before building and testing.

The browser v1.0.0 source/runtime and download remain available. Native campaign acceptance and broader hardware/performance testing are still outstanding.
