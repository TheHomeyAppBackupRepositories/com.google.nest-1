'use strict';

const { fetch } = require('homey-oauth2app');
const fs = require('fs');
const path = require('path');

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

  /** Traits returned by `oAuth2Client.getDevice` */
  traits = {};

  // Define a fallback image for when the image cannot be fetched.
  errorImageFilePath = path.join(__dirname, '../assets/nest-broken-image.png');

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

          this.events[sessionId].urlPromise = new Promise((resolve, reject) => {
            this.events[sessionId].urlPromiseResolve = resolve;
            this.events[sessionId].urlPromiseReject = reject;
          });
          this.events[sessionId].urlPromise.catch(err => {
            this.error(`[Session:${sessionId}] Error Getting URL: ${err.message}`);
          }).finally(() => {
            if (this.events[sessionId] && this.events[sessionId].urlPromiseResolve) {
              delete this.events[sessionId].urlPromiseResolve;
            }
            if (this.events[sessionId] && this.events[sessionId].urlPromiseReject) {
              delete this.events[sessionId].urlPromiseReject;
            }
          });
          // Create Homey.Image
          this.events[sessionId].image = await this.homey.images.createImage();
          this.events[sessionId].image.setStream(async stream => {
            try {
              // Wait for the URL, then pipe it to the image stream. Flow cards with the image tag will wait for this.
              const url = await this.events[sessionId].urlPromise;

              // Fetch the image from the resolved url.
              const res = await this._fetchImage(url);
              if (!res.ok) {
                // Refresh token on any error as the lambda function does not return the original status codes.
                this.log(`[Session:${sessionId}] Could not fetch image, asking new token and trying again... ${res.status} ${res.statusText}`);
                await this.oAuth2Client.refreshToken();
                const retryRes = await this._fetchImage(url);

                if (!retryRes.ok) {
                  throw new Error(`[Session:${sessionId}] Could not fetch image, giving up... ${retryRes.status} ${retryRes.statusText}`);
                }
                // Return the retried image stream
                return retryRes.body.pipe(stream);
              }
              // Return the image stream
              return res.body.pipe(stream);
            } catch (err) {
              this.error(`[Session:${sessionId}] Using backup image ${this.errorImageFilePath}, Error Getting Image: ${err.message}`);
              const imageStream = await fs.createReadStream(this.errorImageFilePath);
              return imageStream.pipe(stream);
            }
          });

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
          }, 1000 * 60);
        }

        // Preview Image Received
        if (body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview']
          && body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview'].previewUrl) {
          // If Event is still registered
          if (this.events[sessionId] && !this.events[sessionId].url) {
            const { previewUrl } = body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview'];

            // Create Static Image URL
            this.events[sessionId].url = `https://google-nest-h264-clip-to-jpg.athom.com/?url=${encodeURIComponent(previewUrl)}`;
            if (this.events[sessionId].urlPromiseResolve) {
              this.events[sessionId].urlPromiseResolve(this.events[sessionId].url);
            }
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
          // Reject the URL Promise as we will not receive the url any more
          if (this.events[sessionId].urlPromiseReject) {
            this.events[sessionId].urlPromiseReject(new Error('No URL received before event ended'));
          }
        }

        if (this.hasTrait('sdm.devices.traits.CameraLiveStream') && !this.hasTrait('sdm.devices.traits.CameraClipPreview')) {
          // These devices will never send an URL. If we want to be fancy we could try to get the frame from the live stream.
          if (this.events[sessionId].urlPromiseReject) {
            this.events[sessionId].urlPromiseReject(new Error('There is no URL for this device'));
          }
        }

        // See https://developers.google.com/nest/device-access/traits/device/camera-event-image
        // Devices without this trait will send a sdm.devices.events.CameraClipPreview.ClipPreview event automatically (when supported by the device).
        if (this.hasTrait('sdm.devices.traits.CameraEventImage')) {
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
              this.events[sessionId].url = url;
              if (this.events[sessionId].urlPromiseResolve) {
                this.events[sessionId].urlPromiseResolve(this.events[sessionId].url);
              }
            }).catch(err => {
              if (this.events[sessionId].urlPromiseReject) {
                this.events[sessionId].urlPromiseReject(err);
              }
            });
          }
        }

        // Start Flow Cards
        if (this.events[sessionId] && this.events[sessionId].flowTriggered !== true) {
          this.events[sessionId].flowTriggered = true;

          const { image } = this.events[sessionId];
          if (image) {
            // If the event that fires a Flow contains a previewUrl, wait for the URL to be generated.
            if (body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview']
            && body.resourceUpdate.events['sdm.devices.events.CameraClipPreview.ClipPreview'].previewUrl) {
              await this.events[sessionId].urlPromise;
            }
            this.log(`Triggering Flow for ${sessionId}...`);
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

  hasTrait(trait) {
    return Object.keys(this.traits).includes(trait);
  }

  /** Called by {@link NestDevice.sync} */
  onSyncFull({ traits }) {
    if (typeof traits === 'object' && traits !== null) {
      this.traits = traits;
    } else {
      this.error('Invalid traits:', traits);
    }
  }

  /** Gets access_token from storage and fetches the image from the url */
  async _fetchImage(url) {
    // Add ?access_token=...
    const token = await this.oAuth2Client.getToken();
    const authenticatedURl = `${url}?access_token=${encodeURIComponent(token.access_token)}`;
    return fetch(authenticatedURl);
  }

};
