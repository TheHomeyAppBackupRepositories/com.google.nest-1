'use strict';

const NestDriver = require('../../lib/NestDriver');

module.exports = class NestDriverDisplay extends NestDriver {

  static DEVICE_TYPE = 'sdm.devices.types.DISPLAY';

};
