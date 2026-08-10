# Validation report

Generated bundle checks performed in the build sandbox:

- TypeScript/TSX parser: 73 source files, zero syntax parse errors at final validation.
- Local relative/`@/` source import resolution: checked and no missing project-local imports.
- JSON: parsed successfully.
- YAML: parsed successfully.
- Linux shell scripts: `bash -n` passed.
- NPM package installation/native Gradle/Xcode compilation could not be executed in this sandbox because the npm registry was unreachable from the container. Run `npm install`, `npx expo install --fix`, `npx expo-doctor`, frontend/backend typecheck and real EAS/device builds after download.

This is a production-oriented source bundle, not a claim that an unsigned/unconfigured archive can be directly submitted to a store without credentials, environment configuration, integration testing, legal disclosures and store metadata.
