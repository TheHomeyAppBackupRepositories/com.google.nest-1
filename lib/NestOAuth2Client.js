'use strict';

const querystring = require('querystring');

const Homey = require('homey');
const { OAuth2Client } = require('homey-oauth2app');

const {
  PROJECT_ID,
  WEBHOOK_ID,
  WEBHOOK_SECRET,
} = Homey.env;

module.exports = class NestOAuth2Client extends OAuth2Client {

  static API_URL = `https://smartdevicemanagement.googleapis.com/v1/enterprises/${PROJECT_ID}`;
  static AUTHORIZATION_URL = `https://nestservices.google.com/partnerconnections/${PROJECT_ID}/auth`
  static TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token';
  static SCOPES = ['https://www.googleapis.com/auth/sdm.service'];

  webhooks = new Set();

  /*
   * OAuth2Client Overloads
   */

  onHandleAuthorizationURL({ scopes, state } = {}) {
    const query = {
      state,
      client_id: this._clientId,
      response_type: 'code',
      scope: this.onHandleAuthorizationURLScopes({ scopes }),
      redirect_uri: this._redirectUrl,
      prompt: 'consent',
      access_type: 'offline',
    };

    if (this._authorizationUrl.includes('?')) {
      return `${this._authorizationUrl}&${querystring.stringify(query)}`;
    }

    return `${this._authorizationUrl}?${querystring.stringify(query)}`;
  }

  async onHandleResult({
    headers,
    ...props
  }) {
    const result = await super.onHandleResult({
      headers,
      ...props,
    });

    if (!this.userId) {
      this.userId = headers.get('User-Id');
      this.homey.log(`Got User ID: ${this.userId}`);
    }

    return result;
  }

  async onHandleNotOK({
    body,
    status,
    statusText,
    headers,
  }) {
    if (body && body.error) {
      if (body.error.message && body.error.status) {
        throw new Error(`${body.error.message} [${body.error.status}]`);
      }

      if (body.error.message) {
        throw new Error(body.error.message);
      }

      if (body.error.status) {
        throw new Error(body.error.status);
      }
    }

    return super.onHandleNotOK({
      body,
      status,
      statusText,
      headers,
    });
  }

  /*
   * Webhooks
   */
  async registerWebhookListener(listener) {
    if (this.webhooks.has(listener)) return;
    this.webhooks.add(listener);

    if (this.webhooks.size === 1) {
      if (!this.userId) {
        await this.getDevices();
        if (!this.userId) {
          throw new Error('Cannot Get User ID');
        }
      }

      if (!this.webhook) {
        this.webhook = await this.homey.cloud.createWebhook(WEBHOOK_ID, WEBHOOK_SECRET, {
          $key: this.userId,
        });
        this.webhook.on('message', ({ body }) => {
          this.homey.log('onWebhook', JSON.stringify(body, false, 2));

          for (const listener of this.webhooks.values()) {
            Promise.resolve().then(async () => {
              await listener({ body });
            }).catch(this.homey.error);
          }
        });
        this.homey.log('Webhook Registered');
      }
    }
  }

  async unregisterWebhookListener(listener) {
    this.webhooks.delete(listener);

    if (this.webhooks.size === 0) {
      if (this.webhook) {
        await this.webhook.unregister();
        delete this.webhook;
        this.homey.log('Webhook Unregistered');
      }
    }
  }

  /*
   * API Methods
   */

  async getDevices() {
    return this.get({
      path: '/devices',
    }).then(result => result.devices);
  }

  async getDevice({ deviceId }) {
    return this.get({
      path: `/devices/${deviceId}`,
    });
  }

  async executeDeviceCommand({ deviceId, command, params = {} }) {
    return this.post({
      path: `/devices/${deviceId}:executeCommand`,
      json: {
        command,
        params,
      },
    });
  }

};
