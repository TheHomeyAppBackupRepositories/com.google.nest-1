'use strict';

const { OAuth2Device } = require('homey-oauth2app');

module.exports = class NestDevice extends OAuth2Device {

  constructor(...props) {
    super(...props);

    this.onOAuth2Saved = this.onOAuth2Saved.bind(this);
    this.onWebhook = this.onWebhook.bind(this);
  }

  async onOAuth2Init() {
    await this.oAuth2Client.registerWebhookListener(this.onWebhook);

    this.registerCapabilityListener('button.unlink_account', async () => {
      this.log('Unlinking account...');

      await this.oAuth2Client.destroy();
    });

    await this.sync();
  }

  async onOAuth2Uninit() {
    await this.oAuth2Client.unregisterWebhookListener(this.onWebhook);
  }

  async sync() {
    const { id: deviceId } = this.getData();
    const device = await this.oAuth2Client.getDevice({ deviceId });

    await this.onSyncFull({
      traits: device.traits,
    });
    await this.onSyncSome({
      traits: device.traits,
    });

    await this.setAvailable();
  }

  async onSyncFull({ traits }) {
    // Overload me
  }

  async onSyncSome({ traits }) {
    // Overload me
  }

  async onWebhook({ body }) {
    // Overload Me
  }

};
