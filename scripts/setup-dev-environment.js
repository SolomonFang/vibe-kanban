#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const net = require("net");

const PORTS_FILE = path.join(__dirname, "..", ".dev-ports.json");
const ENV_FILE = path.join(__dirname, "..", ".env");
const DEV_ASSETS_SEED = path.join(__dirname, "..", "dev_assets_seed");
const DEV_ASSETS = path.join(__dirname, "..", "dev_assets");

/**
 * Load project .env (does not override variables already set in the shell).
 */
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const content = fs.readFileSync(ENV_FILE, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function parsePort(name, raw) {
  const port = parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return port;
}

function makePorts(frontend, backend) {
  return {
    frontend,
    backend,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "localhost" });
    sock.on("connect", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => resolve(true));
  });
}

/**
 * Find a free port starting from a given port
 */
async function findFreePort(startPort = 3000) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
    if (port > 65535) {
      throw new Error("No available ports found");
    }
  }
  return port;
}

/**
 * Load existing ports from file
 */
function loadPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      const data = fs.readFileSync(PORTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn("Failed to load existing ports:", error.message);
  }
  return null;
}

/**
 * Save ports to file
 */
function savePorts(ports) {
  try {
    fs.writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
  } catch (error) {
    console.error("Failed to save ports:", error.message);
    throw error;
  }
}

/**
 * Verify that saved ports are still available
 */
async function verifyPorts(ports) {
  const frontendAvailable = await isPortAvailable(ports.frontend);
  const backendAvailable = await isPortAvailable(ports.backend);

  if (process.argv[2] === "get" && (!frontendAvailable || !backendAvailable)) {
    console.log(
      `Port availability check failed: frontend:${ports.frontend}=${frontendAvailable}, backend:${ports.backend}=${backendAvailable}`
    );
  }

  return frontendAvailable && backendAvailable;
}

function logPorts(label, ports) {
  if (process.argv[2] === "get") {
    console.log(`${label}:`);
    console.log(`Frontend: ${ports.frontend}`);
    console.log(`Backend: ${ports.backend}`);
  }
}

/**
 * Try preferred frontend/backend; if either is busy, bump frontend by 1
 * (backend follows with the same offset) until a free pair is found.
 */
async function resolvePortsBumping(preferredFrontend, preferredBackend, label) {
  const offset = preferredBackend - preferredFrontend;
  if (offset < 1) {
    throw new Error(
      `Backend port must be greater than frontend (got ${preferredFrontend}/${preferredBackend})`
    );
  }

  let frontend = preferredFrontend;
  const maxAttempts = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const backend = frontend + offset;
    if (backend > 65535) {
      throw new Error("No available dev ports found");
    }
    const ports = makePorts(frontend, backend);
    if (await verifyPorts(ports)) {
      const bumped = frontend - preferredFrontend;
      if (bumped === 0) {
        logPorts(label, ports);
      } else {
        logPorts(
          `${label} (${preferredFrontend}/${preferredBackend} busy, +${bumped})`,
          ports
        );
      }
      savePorts(ports);
      return ports;
    }
    frontend++;
  }

  throw new Error("No available dev ports found");
}

/**
 * Allocate ports for development.
 *
 * Priority:
 * 1. FRONTEND_PORT (+ optional BACKEND_PORT) from .env or shell
 * 2. PORT from .env or shell (backend = PORT + 1)
 * 3. .dev-ports.json
 * 4. Default 3000 / 3001
 *
 * If the preferred pair is busy, both ports are bumped by +1 until free.
 */
async function allocatePorts() {
  loadEnvFile();

  if (process.env.FRONTEND_PORT) {
    const frontend = parsePort("FRONTEND_PORT", process.env.FRONTEND_PORT);
    const backend = process.env.BACKEND_PORT
      ? parsePort("BACKEND_PORT", process.env.BACKEND_PORT)
      : frontend + 1;
    return resolvePortsBumping(
      frontend,
      backend,
      "Dev ports from FRONTEND_PORT/BACKEND_PORT"
    );
  }

  if (process.env.PORT) {
    const frontend = parsePort("PORT", process.env.PORT);
    return resolvePortsBumping(frontend, frontend + 1, "Dev ports from PORT");
  }

  const existingPorts = loadPorts();
  if (existingPorts) {
    return resolvePortsBumping(
      existingPorts.frontend,
      existingPorts.backend,
      "Dev ports from .dev-ports.json"
    );
  }

  return resolvePortsBumping(3000, 3001, "Default dev ports");
}

/**
 * Get ports (allocate if needed)
 */
async function getPorts() {
  const ports = await allocatePorts();
  copyDevAssets();
  return ports;
}

/**
 * Copy dev_assets_seed to dev_assets
 */
function copyDevAssets() {
  try {
    if (!fs.existsSync(DEV_ASSETS)) {
      // Copy dev_assets_seed to dev_assets
      fs.cpSync(DEV_ASSETS_SEED, DEV_ASSETS, { recursive: true });

      if (process.argv[2] === "get") {
        console.log("Copied dev_assets_seed to dev_assets");
      }
    }
  } catch (error) {
    console.error("Failed to copy dev assets:", error.message);
  }
}

/**
 * Clear saved ports
 */
function clearPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      fs.unlinkSync(PORTS_FILE);
      console.log("Cleared saved dev ports");
    } else {
      console.log("No saved ports to clear");
    }
  } catch (error) {
    console.error("Failed to clear ports:", error.message);
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case "get":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports));
        })
        .catch(console.error);
      break;

    case "clear":
      clearPorts();
      break;

    case "frontend":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.frontend, null, 2));
        })
        .catch(console.error);
      break;

    case "backend":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.backend, null, 2));
        })
        .catch(console.error);
      break;

    default:
      console.log("Usage:");
      console.log(
        "  node setup-dev-environment.js get     - Setup dev environment (ports + assets)"
      );
      console.log(
        "  node setup-dev-environment.js frontend - Get frontend port only"
      );
      console.log(
        "  node setup-dev-environment.js backend  - Get backend port only"
      );
      console.log(
        "  node setup-dev-environment.js clear    - Clear saved ports"
      );
      console.log("");
      console.log("Preferred ports: set FRONTEND_PORT and BACKEND_PORT in .env");
      console.log("  (see .env.example). If busy, both ports bump by +1 until free.");
      break;
  }
}

module.exports = { getPorts, clearPorts, findFreePort };
