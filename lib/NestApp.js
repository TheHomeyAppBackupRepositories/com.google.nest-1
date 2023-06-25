'use strict';

const { OAuth2App } = require('homey-oauth2app');
const NestOAuth2Client = require('./NestOAuth2Client');

module.exports = class NestApp extends OAuth2App {

  static OAUTH2_CLIENT = NestOAuth2Client;
  static OAUTH2_DEBUG = true;

};
