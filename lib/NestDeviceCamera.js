'use strict';

const { fetch } = require('homey-oauth2app');

const NestDevice = require('./NestDevice');

module.exports = class NestDeviceCamera extends NestDevice {

  events = {
    // [eventSessionId]: {
    //   image: Homey.Image,
    //   flowTriggered: Boolean|undefined,
    //   url: String|undefined,
    //   urlPromise: Promise,
    //   urlPromiseResolve: Function,
    //   urlPromiseReject: Function,
    // }
  };

  // Note: It's a known bug that the image can be older than the most recent doorbell press.
  // This seems to be an issue on Google's end, where the .mp4-clip they send is an old one.
  async onWebhook({ body }) {
    await super.onWebhook({ body });

    if (body.resourceUpdate) {
      const { name } = this.getData();
      if (body.resourceUpdate.name !== name) return;

      if (body.resourceUpdate.events) {
        const {
          eventId,
          eventSessionId,
          eventThreadId,
          eventThreadState,
        } = body;

        const sessionId = eventThreadId || eventSessionId;
        if (!sessionId) return;

        this.log(`Got Event: ${sessionId}`);

        // If this event hasn't been triggered before
        if (!this.events[sessionId]) {
          // Create Event
          this.events[sessionId] = {};

          // Create Homey.Image
          this.events[sessionId].image = await this.homey.images.createImage();
          this.events[sessionId].image.setStream(async stream => {
            // Wait for the URL, then pipe it to the image stream
            const url = await this.events[sessionId].urlPromise;
            const res = await fetch(url);
            return res.body.pipe(stream);
          });
          this.events[sessionId].urlPromise = new Promise((resolve, reject) => {
            this.events[sessionId].urlPromiseResolve = resolve;
            this.events[sessionId].urlPromiseReject = reject;
          });
          this.events[sessionId].urlPromise.catch(err => this.error(`[Session:${sessionId}] Error Getting URL: ${err.message}`));
          this.events[sessionId].cleanup = () => {
            if (!this.events[sessionId]) return;

            this.log(`Cleaning Event ${sessionId}...`);

            // Reject the URL Promise
            if (this.events[sessionId].urlPromiseReject) {
              this.events[sessionId].urlPromiseReject(new Error('Timeout Getting Image URL From Google Nest'));
            }

            // Unregister the Image
            if (this.events[sessionId].image) {
              this.events[sessionId].image
                .unregister()
                .catch(() => { });
            }

            // Delete the Event
            delete this.events[sessionId];
          };

          // Cleanup the event after 1 minute
          this.homey.setTimeout(() => {
            if (this.events[sessionId]
              && this.events[sessionId].cleanup) {
              this.events[sessionId].cleanup();
            }
          }, 1000 * 10);
        }

        // Preview Image Received
        if (body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview']
          && body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview'].previewUrl) {
          // If Event is still registered
          if (this.events[sessionId] && !this.events[sessionId].url) {
            // Get Access Token
            const token = this.oAuth2Client.getToken();

            // Add ?access_token=...
            const { previewUrl } = body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview'];
            const previewUrlAuthenticated = `${previewUrl}?access_token=${token.access_token}`;

            // Create Static Image URL
            this.events[sessionId].url = `https://google-nest-h264-clip-to-jpg.athom.com/?url=${encodeURIComponent(previewUrlAuthenticated)}`;
            this.events[sessionId].urlPromiseResolve(this.events[sessionId].url);
          }
        }

        // If ended, cleanup for the next Flow trigger.
        // This might be the same eventSessionId.
        if (eventThreadState === 'ENDED') {
          // Disabled, because the Image token might be needed later on in a Flow.
          // if (this.events[sessionId]
          //   && this.events[sessionId].cleanup) {
          //   this.events[sessionId].cleanup();
          // }
        }

        // Download image if eventId is present
        const resourceUpdateEvent = body.resourceUpdate.events['sdm.devices.events.CameraPerson.Person']
          || body.resourceUpdate.events['sdm.devices.events.CameraPerson.Motion']
          || body.resourceUpdate.events['sdm.devices.events.CameraPerson.Sound']
          || body.resourceUpdate.events['sdm.devices.events.DoorbellChime.Chime'];

        if (resourceUpdateEvent && resourceUpdateEvent.eventId) {
          this.oAuth2Client.executeDeviceCommand({
            deviceId: this.getData().id,
            command: 'sdm.devices.commands.CameraEventImage.GenerateImage',
            params: {
              eventId: resourceUpdateEvent.eventId,
            },
          }).then(({ url, token }) => {
            this.events[sessionId].url = `${url}?access_token=${token}`;
            this.events[sessionId].urlPromiseResolve(this.events[sessionId].url);
          }).catch(err => {
            this.events[sessionId].urlPromiseReject(err);
          });
        }

        // Start Flow Cards
        if (this.events[sessionId] && this.events[sessionId].flowTriggered !== true) {
          this.events[sessionId].flowTriggered = true;

          const { image } = this.events[sessionId];
          if (image) {
            if (body.resourceUpdate.events['sdm.devices.events.CameraMotion.Motion']) {
              this.homey.flow.getDeviceTriggerCard(`${this.driver.id}_motion`).trigger(this, { image }).catch(this.error);
            }

            if (body.resourceUpdate.events['sdm.devices.events.CameraPerson.Person']) {
              this.homey.flow.getDeviceTriggerCard(`${this.driver.id}_person`).trigger(this, { image }).catch(this.error);
            }

            if (body.resourceUpdate.events['sdm.devices.events.CameraSound.Sound']) {
              this.homey.flow.getDeviceTriggerCard(`${this.driver.id}_sound`).trigger(this, { image }).catch(this.error);
            }

            if (body.resourceUpdate.events['sdm.devices.events.DoorbellChime.Chime']) {
              this.homey.flow.getDeviceTriggerCard(`${this.driver.id}_chime`).trigger(this, { image }).catch(this.error);
            }
          }
        }
      }
    }
  }

};
