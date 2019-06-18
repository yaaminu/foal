// std
import { ok } from 'assert';

// 3p
import {
  Context,
  createApp,
  createService,
  dependency,
  Get,
  hashPassword,
  HttpResponseNoContent,
  HttpResponseOK,
  HttpResponseRedirect,
  HttpResponseUnauthorized,
  Post,
  removeSessionCookie,
  Session,
  setSessionCookie,
  TokenRequired,
  ValidateBody,
  verifyPassword,
} from '@foal/core';
import { Column, createConnection, Entity, getConnection, getRepository } from '@foal/typeorm/node_modules/typeorm';
import * as request from 'supertest';

// FoalTS
import {
  fetchUser,
  fetchUserWithPermissions,
  FoalSession,
  Group,
  Permission,
  PermissionRequired,
  TypeORMStore,
  UserWithPermissions
} from '@foal/typeorm';

describe('[Authorization|permissions] Users', () => {

  let app;
  let tokenUser1: string;
  let tokenUser2: string;

  @Entity()
  class User extends UserWithPermissions {}

  @TokenRequired({ user: fetchUserWithPermissions(User), store: TypeORMStore })
  class AppController {
    @Get('/bar')
    @PermissionRequired('access-bar')
    bar() {
      return new HttpResponseNoContent();
    }

    @Get('/foo')
    @PermissionRequired('access-foo')
    foo() {
      return new HttpResponseNoContent();
    }
  }

  before(async () => {
    process.env.SETTINGS_SESSION_SECRET = 'session-secret';
    await createConnection({
      database: 'e2e_db.sqlite',
      dropSchema: true,
      entities: [ User, FoalSession, Permission, Group ],
      synchronize: true,
      type: 'sqlite',
    });

    const user1 = new User();
    const user2 = new User();

    const perm = new Permission();
    perm.codeName = 'access-foo';
    perm.name = 'Foo permission';
    await getRepository(Permission).save(perm);

    const group = new Group();
    group.name = 'Administrators';
    group.codeName = 'administrators';
    group.permissions = [ perm ];
    await getRepository(Group).save(group);

    user1.userPermissions = [ perm ];
    user2.groups = [ group ];

    await getRepository(User).save([ user1, user2 ]);

    const session1 = await createService(TypeORMStore).createAndSaveSessionFromUser(user1);
    tokenUser1 = session1.getToken();

    const session2 = await createService(TypeORMStore).createAndSaveSessionFromUser(user2);
    tokenUser2 = session2.getToken();

    app = createApp(AppController);
  });

  after(async () => {
    await getConnection().close();
    delete process.env.SETTINGS_SESSION_SECRET;
  });

  it('cannot access protected routes if they do not have the permission.', () => {
    return Promise.all([
      request(app).get('/bar').set('Authorization', `Bearer ${tokenUser1}`).expect(403),
      request(app).get('/bar').set('Authorization', `Bearer ${tokenUser2}`).expect(403),
    ]);
  });

  it('can access protected routes if they have the permission.', () => {
    return Promise.all([
      request(app).get('/foo').set('Authorization', `Bearer ${tokenUser1}`).expect(204),
      request(app).get('/foo').set('Authorization', `Bearer ${tokenUser2}`).expect(204),
    ]);
  });

});