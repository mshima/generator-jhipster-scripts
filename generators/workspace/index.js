const fs = require('fs');

function createGenerator(env) {
  return class JhipsterScriptsAppGenerator extends env.requireGenerator() {
    constructor(args, options) {
      super(args, {
        customPriorities: [
          {
            priorityName: 'postWriting',
            queueName: 'postWriting',
            before: 'conflicts'
          }
        ],
        ...options
      });
    }

    get postWriting() {
      return {
        async listDirs() {
          this.packageJson = this.createStorage('package.json');
          this.packageJson.set('dependencies', {
            'wait-on': '^5.0.0'
          });
          this.scripts = this.packageJson.createStorage('scripts');
          this.scripts.set(
            'ci:github:configure',
            `echo "::set-output name=docker_others::false" && echo "::set-output name=e2e::true"`
          );
          const ciScripts = [
            'ci:frontend:test',
            'backend:info',
            'backend:doc:test',
            'ci:backend:test',
            ['ci:test:prepare:docker'],
            ['ci:e2e:package', 'java:docker'],
            ['ci:e2e:prepare'],
            'ci:server:await',
            ['ci:e2e:run', 'e2e']
          ];
          ciScripts.forEach(ciScript => {
            const scriptName = Array.isArray(ciScript) ? ciScript[0] : ciScript;
            this.scripts.set(scriptName, '');
          });

          const folders = [];
          const dir = await fs.promises.opendir('./');
          for await (const dirent of dir) {
            if (!dirent.isDirectory()) {
              continue;
            }

            if (dirent.name === 'docker-compose') {
              this.scripts.set(
                'ci:e2e:prepare',
                'ls node_modules || npm install && cd docker-compose && docker-compose up -d && docker ps -a && cd .. && npm run ci:server:await && docker ps -a'
              );
            } else if (dirent.name === 'kubernetes') {
              throw new Error('Kubernetes is not supported');
            } else {
              folders.push(dirent.name);
            }
          }

          ciScripts.forEach(ciScript => {
            let scriptName = ciScript;
            let childScript = ciScript;
            if (Array.isArray(ciScript)) {
              scriptName = ciScript[0];
              if (ciScript.length === 1) {
                return;
              }

              childScript = ciScript[1];
            }

            this.scripts.set(
              scriptName,
              folders.map(folder => `cd ${folder} && npm run ${childScript} && cd ..`).join(' && ')
            );
          });
        }
      };
    }
  };
}

module.exports = {
  createGenerator
};
