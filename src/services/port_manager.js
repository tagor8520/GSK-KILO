const net = require('net');
const logger = require('../utils/logger');
const { DEFAULT_PORT, HOST } = require('../config/paths');

class PortManager {
  /**
   * Check if a specific TCP port is available on the target host
   * @param {number} port 
   * @param {string} host 
   * @returns {Promise<boolean>}
   */
  static isPortAvailable(port, host = HOST) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, host);
    });
  }

  /**
   * Find the first available port starting from startPort
   * @param {number} startPort 
   * @param {number} maxTries 
   * @param {string} host 
   * @returns {Promise<number>}
   */
  static async findAvailablePort(startPort = DEFAULT_PORT, maxTries = 50, host = HOST) {
    for (let offset = 0; offset < maxTries; offset++) {
      const candidatePort = startPort + offset;
      const available = await PortManager.isPortAvailable(candidatePort, host);
      if (available) {
        if (offset > 0) {
          logger.warn(`Preferred port ${startPort} was occupied. Selected alternate port: ${candidatePort}`);
        } else {
          logger.debug(`Preferred port ${startPort} is available`);
        }
        return candidatePort;
      }
    }

    // Fallback: request OS-assigned ephemeral port
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, host, () => {
        const address = server.address();
        const assignedPort = address.port;
        server.close(() => {
          logger.warn(`Selected OS-assigned ephemeral port: ${assignedPort}`);
          resolve(assignedPort);
        });
      });
      server.on('error', reject);
    });
  }
}

module.exports = PortManager;
