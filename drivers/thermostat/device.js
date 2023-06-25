'use strict';

const NestDevice = require('../../lib/NestDevice');

module.exports = class NestDeviceThermostat extends NestDevice {

  constructor(...props) {
    super(...props);

    this.onCapabilityTargetTemperature = this.onCapabilityTargetTemperature.bind(this);
    this.onCapabilityTargetTemperatureCool = this.onCapabilityTargetTemperatureCool.bind(this);
    this.onCapabilityNestThermostatMode = this.onCapabilityNestThermostatMode.bind(this);
    this.onCapabilityNestThermostatEco = this.onCapabilityNestThermostatEco.bind(this);
  }

  async onOAuth2Init() {
    await super.onOAuth2Init();

    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature);
    this.registerCapabilityListener('target_temperature.cool', this.onCapabilityTargetTemperatureCool);
    this.registerCapabilityListener('nest_thermostat_mode', this.onCapabilityNestThermostatMode);
    this.registerCapabilityListener('nest_thermostat_eco', this.onCapabilityNestThermostatEco);
  }

  async onWebhook({ body }) {
    const { name } = this.getData();

    // this.log('onWebhook', JSON.stringify(body, false, 2));

    if (body.resourceUpdate) {
      if (body.resourceUpdate.name !== name) return;

      if (body.resourceUpdate.traits) {
        await this.onSyncSome({
          traits: body.resourceUpdate.traits,
        });
      }
    }
  }

  async onSyncFull({ traits }) {
    this.log('onSyncFull Traits:', traits);

    if (traits['sdm.devices.traits.ThermostatMode']) {
      // nest_thermostat_mode
      await this.addCapability('nest_thermostat_mode');

      // target_temperature
      if (traits['sdm.devices.traits.ThermostatMode'].availableModes.includes('HEAT')
        || traits['sdm.devices.traits.ThermostatMode'].availableModes.includes('HEATCOOl')) {
        await this.addCapability('target_temperature');
      } else {
        await this.removeCapability('target_temperature');
      }

      // target_temperature.cool
      if (traits['sdm.devices.traits.ThermostatMode'].availableModes.includes('COOL')
        || traits['sdm.devices.traits.ThermostatMode'].availableModes.includes('HEATCOOl')) {
        await this.addCapability('target_temperature.cool');
      } else {
        await this.removeCapability('target_temperature.cool');
      }
    } else {
      await this.removeCapability('nest_thermostat_mode');
    }

    // nest_thermostat_eco
    if (traits['sdm.devices.traits.ThermostatEco']) {
      await this.addCapability('nest_thermostat_eco');
    } else {
      await this.removeCapability('nest_thermostat_eco');
    }

    // measure_temperature
    if (traits['sdm.devices.traits.Temperature']) {
      await this.addCapability('measure_temperature');
    } else {
      await this.removeCapability('measure_temperature');
    }

    // measure_humidity
    if (traits['sdm.devices.traits.Humidity']) {
      await this.addCapability('measure_humidity');
    } else {
      await this.removeCapability('measure_humidity');
    }

    // nest_thermostat_hvac
    if (traits['sdm.devices.traits.ThermostatHvac']) {
      await this.addCapability('nest_thermostat_hvac');
    }
  }

  async onSyncSome({ traits }) {
    this.log('onSyncSome Traits:', traits);

    // Target Temperature
    if (traits['sdm.devices.traits.ThermostatTemperatureSetpoint']) {
      // target_temperature
      if (typeof traits['sdm.devices.traits.ThermostatTemperatureSetpoint'].heatCelsius === 'number') {
        await this.setCapabilityValue('target_temperature', traits['sdm.devices.traits.ThermostatTemperatureSetpoint'].heatCelsius);
      }

      // target_temperature.cool
      if (typeof traits['sdm.devices.traits.ThermostatTemperatureSetpoint'].coolCelsius === 'number') {
        await this.setCapabilityValue('target_temperature.cool', traits['sdm.devices.traits.ThermostatTemperatureSetpoint'].coolCelsius);
      }
    }

    // Eco
    if (traits['sdm.devices.traits.ThermostatEco']) {
      if (traits['sdm.devices.traits.ThermostatEco'].mode === 'MANUAL_ECO') {
        await this.setCapabilityValue('nest_thermostat_eco', true);

        // Heat
        if (typeof traits['sdm.devices.traits.ThermostatEco'].heatCelsius === 'number') {
          await this.setCapabilityValue('target_temperature', traits['sdm.devices.traits.ThermostatEco'].heatCelsius);
        }

        // Cool
        if (typeof traits['sdm.devices.traits.ThermostatEco'].coolCelsius === 'number') {
          if (this.hasCapability('target_temperature.cool')) {
            await this.setCapabilityValue('target_temperature.cool', traits['sdm.devices.traits.ThermostatEco'].coolCelsius);
          }
        }
      } else if (traits['sdm.devices.traits.ThermostatEco'].mode === 'OFF') {
        await this.setCapabilityValue('nest_thermostat_eco', false);
      }
    }

    // Measured Temperature
    if (traits['sdm.devices.traits.Temperature']) {
      if (typeof traits['sdm.devices.traits.Temperature'].ambientTemperatureCelsius === 'number') {
        await this.setCapabilityValue('measure_temperature', traits['sdm.devices.traits.Temperature'].ambientTemperatureCelsius);
      } else {
        await this.setCapabilityValue('measure_temperature', null);
      }
    }

    // Humidity
    if (traits['sdm.devices.traits.Humidity']) {
      if (typeof traits['sdm.devices.traits.Humidity'].ambientHumidityPercent === 'number') {
        await this.setCapabilityValue('measure_humidity', traits['sdm.devices.traits.Humidity'].ambientHumidityPercent);
      } else {
        await this.setCapabilityValue('measure_humidity', null);
      }
    }

    // Thermostat Mode
    if (traits['sdm.devices.traits.ThermostatMode']) {
      switch (traits['sdm.devices.traits.ThermostatMode'].mode) {
        case 'HEAT': {
          await this.setCapabilityValue('nest_thermostat_mode', 'heat');
          break;
        }
        case 'COOL': {
          await this.setCapabilityValue('nest_thermostat_mode', 'cool');
          break;
        }
        case 'HEATCOOL': {
          await this.setCapabilityValue('nest_thermostat_mode', 'heatcool');
          break;
        }
        case 'OFF': {
          await this.setCapabilityValue('nest_thermostat_mode', 'off');
          break;
        }
        default:
          await this.setCapabilityValue('nest_thermostat_mode', null);
          break;
      }
    }

    if (traits['sdm.devices.traits.ThermostatHvac']) {
      switch (traits['sdm.devices.traits.ThermostatHvac'].status) {
        case 'HEATING': {
          await this.setCapabilityValue('nest_thermostat_hvac', 'heating');
          break;
        }
        case 'COOLING': {
          await this.setCapabilityValue('nest_thermostat_hvac', 'cooling');
          break;
        }
        case 'OFF': {
          await this.setCapabilityValue('nest_thermostat_hvac', 'off');
          break;
        }
        default:
          await this.setCapabilityValue('nest_thermostat_hvac', null);
          break;
      }
    }
  }

  async onCapabilityTargetTemperature(value) {
    this.log('onCapabilityTargetTemperature', value);
    const { id: deviceId } = this.getData();

    const nestThermostatEco = this.getCapabilityValue('nest_thermostat_eco');
    if (nestThermostatEco) {
      throw new Error('Cannot change the temperature when the thermostat is in Eco-mode.');
    }

    const nestThermostatMode = this.getCapabilityValue('nest_thermostat_mode');
    if (nestThermostatMode === 'heat') {
      return this.oAuth2Client.executeDeviceCommand({
        deviceId,
        command: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat',
        params: {
          heatCelsius: value,
        },
      }).catch(err => {
        if (err.message.includes('command not allowed when thermostat in MANUAL_ECO mode.')) {
          throw new Error('Cannot change the temperature when the thermostat is in Eco-mode.');
        }

        throw err;
      });
    }

    if (nestThermostatMode === 'heatcool') {
      const heatCelsius = value;
      const coolCelsius = this.getCapabilityValue('target_temperature.cool');

      if (heatCelsius >= coolCelsius) {
        throw new Error('The cool temperature must be greater than the heat temperature.');
      }

      return this.oAuth2Client.executeDeviceCommand({
        deviceId,
        command: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange',
        params: {
          heatCelsius,
          coolCelsius: typeof coolCelsius === 'number'
            ? coolCelsius
            : value,
        },
      }).catch(err => {
        if (err.message.includes('command not allowed when thermostat in MANUAL_ECO mode.')) {
          throw new Error('Cannot change the temperature when the thermostat is in Eco-mode.');
        }

        throw err;
      });
    }

    throw new Error('Thermostat must be in Heat or Heat+Cool mode.');
  }

  async onCapabilityTargetTemperatureCool(value) {
    this.log('onCapabilityTargetTemperatureCool', value);
    const { id: deviceId } = this.getData();

    const nestThermostatEco = this.getCapabilityValue('nest_thermostat_eco');
    if (nestThermostatEco) {
      throw new Error('Cannot change the temperature when the thermostat is in Eco-mode.');
    }

    const nestThermostatMode = this.getCapabilityValue('nest_thermostat_mode');
    if (nestThermostatMode === 'cool') {
      return this.oAuth2Client.executeDeviceCommand({
        deviceId,
        command: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetCool',
        params: {
          coolCelsius: value,
        },
      }).catch(err => {
        if (err.message.includes('command not allowed when thermostat in MANUAL_ECO mode.')) {
          throw new Error('Cannot change the temperature when the thermostat is in Eco-mode.');
        }

        throw err;
      });
    }

    if (nestThermostatMode === 'heatcool') {
      const heatCelsius = this.getCapabilityValue('target_temperature');
      const coolCelsius = value;

      return this.oAuth2Client.executeDeviceCommand({
        deviceId,
        command: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange',
        params: {
          coolCelsius,
          heatCelsius: typeof heatCelsius === 'number'
            ? heatCelsius
            : coolCelsius,
        },
      }).catch(err => {
        if (err.message.includes('command not allowed when thermostat in MANUAL_ECO mode.')) {
          throw new Error('Cannot change the temperature when the thermostat is in Eco-mode.');
        }

        throw err;
      });
    }

    throw new Error('Thermostat must be in Cool or Heat+Cool mode.');
  }

  async onCapabilityNestThermostatMode(value) {
    this.log('onCapabilityNestThermostatMode', value);

    let mode;
    switch (value) {
      case 'off':
        mode = 'OFF';
        break;
      case 'heat':
        mode = 'HEAT';
        break;
      case 'cool':
        mode = 'COOL';
        break;
      case 'heatcool':
        mode = 'HEATCOOL';
        break;
      default:
        throw new Error(`Invalid Mode: ${value}`);
    }

    const { id: deviceId } = this.getData();
    await this.oAuth2Client.executeDeviceCommand({
      deviceId,
      command: 'sdm.devices.commands.ThermostatMode.SetMode',
      params: { mode },
    }).catch(err => {
      if (err && err.message.includes('INVALID_ARGUMENT')) {
        throw new Error(this.homey.__('thermostat.mode_not_supported'));
      }
      throw err;
    });
  }

  async onCapabilityNestThermostatEco(value) {
    this.log('onCapabilityNestThermostatEco', value);

    const { id: deviceId } = this.getData();
    await this.oAuth2Client.executeDeviceCommand({
      deviceId,
      command: 'sdm.devices.commands.ThermostatEco.SetMode',
      params: {
        mode: value
          ? 'MANUAL_ECO'
          : 'OFF',
      },
    }).catch(err => {
      if (err && err.message.includes('INVALID_ARGUMENT')) {
        throw new Error(this.homey.__('thermostat.mode_not_supported'));
      }
      throw err;
    });
  }

};
