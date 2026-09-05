"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const rootEnvPath = path.join(repoRoot, ".env");
const rootEnvExamplePath = path.join(repoRoot, ".env.example");
const appNames = ["frontend", "backend"];
const force = process.argv.slice(2).includes("--force");
const unexpectedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--force");

function printUsage() {
  console.error("Usage: node scripts/setup-env.js [--force]");
}

function pathExists(filePath) {
  try {
    return {
      exists: true,
      isSymlink: fs.lstatSync(filePath).isSymbolicLink(),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { exists: false, isSymlink: false };
    }

    throw error;
  }
}

function printSymlinkHint() {
  console.error(
    "Creating environment symlinks failed. On Windows, enable Developer Mode or run this command from an elevated shell.",
  );
}

function createAppSymlink(appName) {
  const appDirectory = path.join(repoRoot, "apps", appName);
  const appEnvPath = path.join(appDirectory, ".env");
  const relativeTarget = "../../.env";
  const status = pathExists(appEnvPath);

  if (status.exists && status.isSymlink) {
    try {
      fs.unlinkSync(appEnvPath);
    } catch (error) {
      console.error(`${appName}: could not remove the existing .env symlink.`, error);
      return false;
    }
  } else if (status.exists) {
    if (!force) {
      console.error(
        `${appName}: existing .env is a real file or directory; refusing to overwrite. Re-run with --force to back it up and replace it with a symlink.`,
      );
      return false;
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const backupPath = path.join(appDirectory, `.env.backup-${timestamp}`);

    try {
      fs.renameSync(appEnvPath, backupPath);
      console.log(
        `${appName}: backed up existing .env to ${path.basename(backupPath)}.`,
      );
    } catch (error) {
      console.error(`${appName}: could not back up the existing .env.`, error);
      return false;
    }
  }

  try {
    fs.symlinkSync(relativeTarget, appEnvPath, "file");
    console.log(`${appName}: created .env symlink -> ${relativeTarget}.`);
    return true;
  } catch (error) {
    console.error(`${appName}: could not create the .env symlink.`, error);
    if (
      error &&
      ["EACCES", "EEXIST", "EPERM", "ENOTSUP"].includes(error.code)
    ) {
      printSymlinkHint();
    }
    return false;
  }
}

function main() {
  if (unexpectedArguments.length > 0) {
    console.error(
      `Unknown option${unexpectedArguments.length === 1 ? "" : "s"}: ${unexpectedArguments.join(", ")}`,
    );
    printUsage();
    process.exitCode = 1;
    return;
  }

  const rootEnvStatus = pathExists(rootEnvPath);
  if (!rootEnvStatus.exists) {
    try {
      fs.copyFileSync(rootEnvExamplePath, rootEnvPath);
      console.log("Root .env did not exist; created it from .env.example.");
    } catch (error) {
      console.error("Could not create root .env from .env.example.", error);
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("Root .env already exists; left it untouched.");
  }

  const allSucceeded = appNames
    .map((appName) => createAppSymlink(appName))
    .every(Boolean);

  if (!allSucceeded) {
    process.exitCode = 1;
  }
}

main();
