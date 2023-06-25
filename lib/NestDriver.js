'use strict';

const { OAuth2Driver } = require('homey-oauth2app');

module.exports = class NestDriver extends OAuth2Driver {

  static DEVICE_TYPE = null;

  async onPairListDevices({ oAuth2Client }) {
    const devices = await oAuth2Client.getDevices();
    return devices
      .filter(device => {
        return device.type === this.constructor.DEVICE_TYPE;
      })
      .map(device => ({
        name: device.traits['sdm.devices.traits.Info'].customName || undefined,
        data: {
          id: device.name.split('/').pop(),
          name: device.name,
        },
      }));
  }

  onPair(socket) {
    socket.setHandler('isAuthenticated', async () => {
      const savedSessions = this.homey.app.getSavedOAuth2Sessions();
      return Object.keys(savedSessions).length > 0;
    });

    super.onPair(socket);
  }

};
