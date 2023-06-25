'use strict';

const NestDriver = require('../../lib/NestDriver');

module.exports = class NestDriverCamera extends NestDriver {

  static DEVICE_TYPE = 'sdm.devices.types.CAMERA';

};
