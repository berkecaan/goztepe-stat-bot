import session from 'express-session';
export class SQLiteSessionStore extends session.Store {
  constructor(repo) {
    super();
    this.repo = repo;
  }
  get(sid, cb) {
    try {
      const value = this.repo.sessionGet(sid);
      cb(null, value ? JSON.parse(value) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid, value, cb = () => {}) {
    try {
      this.repo.sessionSet(
        sid,
        JSON.stringify(value),
        new Date(value.cookie.expires || Date.now() + 3600000).getTime(),
      );
      cb();
    } catch (e) {
      cb(e);
    }
  }
  destroy(sid, cb = () => {}) {
    try {
      this.repo.sessionDelete(sid);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  touch(sid, value, cb = () => {}) {
    this.set(sid, value, cb);
  }
}
