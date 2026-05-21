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

async function assertPortsAvailable(ports, label) {
  if (await verifyPorts(ports)) return;

  console.error(`\n${label} — ports are already in use:`);
  console.error(`  Frontend: http://localhost:${ports.frontend}`);
  console.error(`  Backend:  http://localhost:${ports.backend}`);
  console.error(
    "Stop the process using these ports, or change FRONTEND_PORT/BACKEND_PORT in .env"
  );
  console.error(
    "Set DEV_PORTS_DYNAMIC=1 to allow automatic reassignment (breaks browser cache for that origin)."
  );
  const err = new Error("Dev ports are not available");
  if (require.main === module) {
    process.exit(1);
  }
  throw err;
}

function logPorts(label, ports) {
  if (process.argv[2] === "get") {
    console.log(`${label}:`);
    console.log(`Frontend: ${ports.frontend}`);
    console.log(`Backend: ${ports.backend}`);
  }
}

/**
 * Allocate ports for development.
 *
 * Priority:
 * 1. FRONTEND_PORT (+ optional BACKEND_PORT) from .env or shell — fixed, never auto-changed
 * 2. PORT from .env or shell — fixed frontend, backend = PORT + 1
 * 3. .dev-ports.json — reused if free; if busy, fail unless DEV_PORTS_DYNAMIC=1
 * 4. Scan from 3000 — only when no saved ports or DEV_PORTS_DYNAMIC=1
 */
async function allocatePorts() {
  loadEnvFile();

  if (process.env.FRONTEND_PORT) {
    const frontend = parsePort("FRONTEND_PORT", process.env.FRONTEND_PORT);
    const backend = process.env.BACKEND_PORT
      ? parsePort("BACKEND_PORT", process.env.BACKEND_PORT)
      : frontend + 1;
    const ports = makePorts(frontend, backend);
    await assertPortsAvailable(ports, "Fixed ports from FRONTEND_PORT/BACKEND_PORT");
    savePorts(ports);
    logPorts("Using fixed dev ports from .env", ports);
    return ports;
  }

  if (process.env.PORT) {
    const frontend = parsePort("PORT", process.env.PORT);
    const ports = makePorts(frontend, frontend + 1);
    await assertPortsAvailable(ports, "Fixed ports from PORT");
    savePorts(ports);
    logPorts("Using PORT environment variable", ports);
    return ports;
  }

  const existingPorts = loadPorts();
  const allowDynamic = process.env.DEV_PORTS_DYNAMIC === "1";

  if (existingPorts) {
    if (await verifyPorts(existingPorts)) {
      logPorts("Reusing saved dev ports", existingPorts);
      return existingPorts;
    }
    if (!allowDynamic) {
      await assertPortsAvailable(existingPorts, "Saved dev ports (.dev-ports.json)");
    }
    if (process.argv[2] === "get") {
      console.log(
        "Saved ports are busy; DEV_PORTS_DYNAMIC=1 — finding new ones..."
      );
    }
  }

  const frontendPort = await findFreePort(3000);
  const backendPort = await findFreePort(frontendPort + 1);
  const ports = makePorts(frontendPort, backendPort);
  savePorts(ports);
  logPorts("Allocated new dev ports", ports);
  return ports;
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
      console.log("Fixed ports: set FRONTEND_PORT and BACKEND_PORT in .env");
      console.log("  (see .env.example). Ports will not change while cache stays valid.");
      console.log("  Set DEV_PORTS_DYNAMIC=1 to allow auto-reassign when ports are busy.");
      break;
  }
}

module.exports = { getPorts, clearPorts, findFreePort };
