const path = require('path');
const assert = require('yeoman-assert');
const helpers = require('yeoman-test');

describe('jhipster-scripts:app', () => {
  let ctx;

  beforeEach(() => {
    ctx = helpers
      .create('jhipster-scripts:app')
      .withLookups([{npmPaths: path.join(__dirname, '..', '..')}])
      .build();
  });

  afterEach(() => {
    ctx.cleanTestDirectory();
  });

  describe('with sample values', () => {
    beforeEach(() => {
      return ctx.run();
    });

    it("doesn't fails", () => {
      assert(true);
    });
  });
});
