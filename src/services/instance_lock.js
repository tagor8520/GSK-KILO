const InstanceManager = require('./instance_manager');

class InstanceLock {
  static probeHealth(host, port, timeoutMs = 2000) {
    return InstanceManager.probeInstanceStatus(host, port, timeoutMs).then(res => res.ok);
  }

  static async checkExistingInstance() {
    return InstanceManager.findActiveHealthyInstance();
  }

  static acquireLock(instanceInfo) {
    return InstanceManager.registerInstance(instanceInfo);
  }

  static releaseLock(instanceId) {
    return InstanceManager.unregisterInstance(instanceId);
  }

  static removeLockFile() {
    const { LOCK_FILE } = require('../config/paths');
    const fs = require('fs');
    try {
      if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    } catch {}
  }
}

module.exports = InstanceLock;
