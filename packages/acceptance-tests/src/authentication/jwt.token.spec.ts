import {
  Config, Context, controller, createApp, Get,
  hashPassword, HttpResponseOK,
  HttpResponseUnauthorized, Post, ValidateBody, verifyPassword
} from '@foal/core';
import { JWTRequired } from '@foal/jwt';
import { fetchUser } from '@foal/typeorm';
import {
  Column, createConnection, Entity, getConnection, getRepository,
  PrimaryGeneratedColumn
} from '@foal/typeorm/node_modules/typeorm';
import { deepStrictEqual, strictEqual } from 'assert';
import { sign } from 'jsonwebtoken';
import * as request from 'supertest';

describe('[Authentication|JWT|no cookie|no redirection] Users', () => {

  let app: any;
  let token: string;

  let blackList: string[];

  function isBlackListed(token: string): boolean {
    return blackList.includes(token);
  }

  @Entity()
  class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column()
    nickname: string;
  }

  @JWTRequired({ user: fetchUser(User), blackList: isBlackListed })
  class ApiController {
    @Get('/products')
    readProducts(ctx: Context<User>) {
      return new HttpResponseOK({
        nickname: ctx.user.nickname
      });
    }
  }

  class LoginController {

    @Post('/login')
    @ValidateBody({
      additionalProperties: false,
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' }
      },
      required: [ 'email', 'password' ],
      type: 'object',
    })
    async login(ctx: Context) {
      const user = await getRepository(User).findOne({ email: ctx.request.body.email });

      if (!user) {
        return new HttpResponseUnauthorized();
      }

      if (!await verifyPassword(ctx.request.body.password, user.password)) {
        return new HttpResponseUnauthorized();
      }

      const payload = {
        email: user.email,
        id: user.id,
      };
      const secret = Config.get<string>('settings.jwt.secretOrPublicKey');

      token = await new Promise<string>((resolve, reject) => {
        sign(payload, secret, { subject: user.id.toString() }, (err, value: string) => {
          if (err) {
            return reject(err);
          }
          resolve(value);
        });
      });
      return new HttpResponseOK({
        token
      });
    }
  }

  class AppController {
    subControllers = [
      controller('', LoginController),
      controller('/api', ApiController),
    ];
  }

  before(async () => {
    process.env.SETTINGS_JWT_SECRET_OR_PUBLIC_KEY = 'session-secret';
    await createConnection({
      database: 'e2e_db.sqlite',
      dropSchema: true,
      entities: [ User ],
      synchronize: true,
      type: 'sqlite',
    });

    const user = new User();
    user.email = 'john@foalts.org';
    user.password = await hashPassword('password');
    user.nickname = 'Johny';
    await getRepository(User).save(user);

    blackList = [];

    app = createApp(AppController);
  });

  after(async () => {
    await getConnection().close();
    delete process.env.SETTINGS_JWT_SECRET_OR_PUBLIC_KEY;
  });

  it('cannot access protected routes if they are not logged in.', () => {
    return request(app)
      .get('/api/products')
      .expect(400)
      .expect({
        code: 'invalid_request',
        description: 'Authorization header not found.'
      });
  });

  it('can log in.', async () => {
    // Try to login with a wrong email
    await request(app)
      .post('/login')
      .send({ email: 'mary@foalts.org', password: 'password' })
      .expect(401);

    // Try to login with a wrong email
    await request(app)
      .post('/login')
      .send({ email: 'john@foalts.org', password: 'wrong_password' })
      .expect(401);

    // Login with a correct email
    await request(app)
      .post('/login')
      .send({ email: 'john@foalts.org', password: 'password' })
      .expect(200)
      .then(response => {
        strictEqual(typeof response.body.token, 'string');
        token = response.body.token;
      });
  });

  it('can access routes once they are logged in.', () => {
    return request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then(response => {
        deepStrictEqual(response.body, {
          nickname: 'Johny'
        });
      });
  });

  it('cannot access routes if the token is blacklisted.', () => {
    blackList.push(token);
    return request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect({
        code: 'invalid_token',
        description: 'jwt revoked'
      });
  });

});