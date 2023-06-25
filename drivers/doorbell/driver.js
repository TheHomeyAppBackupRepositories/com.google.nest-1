'use strict';

const NestDriver = require('../../lib/NestDriver');

module.exports = class NestDriverDoorbell extends NestDriver {

  static DEVICE_TYPE = 'sdm.devices.types.DOORBELL';

};
