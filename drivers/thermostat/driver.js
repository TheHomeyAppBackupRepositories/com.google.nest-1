'use strict';

const NestDriver = require('../../lib/NestDriver');

module.exports = class NestDriverThermostat extends NestDriver {

  static DEVICE_TYPE = 'sdm.devices.types.THERMOSTAT';

  async onOAuth2Init() {
    await super.onOAuth2Init();

    this.homey.flow.getConditionCard('nest_thermostat_mode_equals')
      .registerRunListener(async ({ device, mode }) => {
        return device.getCapabilityValue('nest_thermostat_mode') === mode;
      });

    this.homey.flow.getConditionCard('nest_thermostat_eco_enabled')
      .registerRunListener(async ({ device }) => {
        return device.getCapabilityValue('nest_thermostat_eco') === true;
      });

    this.homey.flow.getActionCard('set_nest_thermostat_mode')
      .registerRunListener(async ({ device, mode }) => {
        await device.triggerCapabilityListener('nest_thermostat_mode', mode);
      });

    this.homey.flow.getActionCard('enable_nest_thermostat_eco')
      .registerRunListener(async ({ device }) => {
        await device.triggerCapabilityListener('nest_thermostat_eco', true);
      });

    this.homey.flow.getActionCard('disable_nest_thermostat_eco')
      .registerRunListener(async ({ device }) => {
        await device.triggerCapabilityListener('nest_thermostat_eco', false);
      });

    this.homey.flow.getActionCard('set_nest_thermostat_cool')
      .registerRunListener(async ({ device, temperature }) => {
        await device.triggerCapabilityListener('target_temperature.cool', temperature);
      });
  }

};
