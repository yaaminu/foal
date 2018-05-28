import { login, logout, Module, view } from '@foal/core';

import { Authenticator } from './services/authenticator.service';

export const AuthModule: Module = {
  controllers: [
    login('/local', Authenticator, {
      failureRedirect: '/auth?invalid_credentials=true',
      successRedirect: '/home',
    }),
      // .withPreHook(validateEmailAndPassword())
      // .withPostHook(returnCurrentUserOnSuccess([ 'username', 'id' ])),

    logout('/logout', {
      httpMethod: 'POST',
      redirect: '/auth',
    }),

    view('/', require('./templates/login.html'), { name: 'FoalTS' })
  ],
  path: '/auth'
};
