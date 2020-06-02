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

      this.sbsBlueprint = true;
    }

    get postWriting() {
      return {
        loadConfig() {
          this.packageJson = this.createStorage('package.json');
          this.jhipsterConfig = this.createStorage('.yo-rc.json', 'generator-jhipster');
          this.scripts = this.packageJson.createStorage('scripts');
          this.clientFramework = this.jhipsterConfig.get('clientFramework') || 'angular';
          this.testFrameworks = this.jhipsterConfig.get('testFrameworks') || [];
        },
        dependencies() {
          const devDependencies = this.packageJson.createStorage('devDependencies');
          devDependencies.set('wait-on', '^5.0.0');
          devDependencies.set('concurrently', '^5.2.0');
          const allDevDependencies = devDependencies.getAll();
          Object.keys(allDevDependencies)
            .filter(field => field.startsWith('generator-jhipster'))
            .forEach(field => {
              devDependencies.delete(field);
            });
        },
        frontend() {
          if (this.clientFramework === 'react') {
            this.scripts.set('ci:frontend:test', 'npm run test-ci');
          } else {
            this.scripts.set('ci:frontend:test', 'npm test');
          }
        },
        docker() {
          const databaseType = this.jhipsterConfig.get('databaseType');
          if (databaseType === 'sql') {
            const prodDatabaseType = this.jhipsterConfig.get('prodDatabaseType');
            if (prodDatabaseType === 'no' || prodDatabaseType === 'oracle') {
              this.scripts.set('docker:db', `echo "Docker for db ${prodDatabaseType} not configured"`);
            } else {
              this.scripts.set('docker:db', `docker-compose -f src/main/docker/${prodDatabaseType}.yml up -d`);
            }

            this.scripts.set('ci:test:prepare:docker', 'npm run docker:db');
            this.scripts.set('ci:e2e:prepare:docker', '');
          } else {
            const dockerFile = `src/main/docker/${databaseType}.yml`;
            if (databaseType === 'couchbase' || databaseType === 'cassandra') {
              this.scripts.set('ci:test:prepare:docker', `docker-compose -f ${dockerFile} build`);
              this.scripts.set('docker:db', `docker-compose -f ${dockerFile} up -d`);
              this.scripts.set('ci:e2e:prepare:docker', 'npm run docker:db');
            } else {
              if (this.fs.exists(this.destinationPath(dockerFile))) {
                this.scripts.set('docker:db', `docker-compose -f ${dockerFile} up -d`);
              } else {
                this.scripts.set('docker:db', `echo "Docker for db ${databaseType} not configured"`);
              }

              this.scripts.set('ci:test:prepare:docker', 'npm run docker:db');
              this.scripts.set('ci:e2e:prepare:docker', 'npm run docker:db');
            }
          }

          this.dockerOthers = [];
          ['keycloak', 'elasticsearch', 'kafka', 'consul', 'redis', 'memcached', 'jhipster-registry'].forEach(
            dockerConfig => {
              const dockerFile = `src/main/docker/${dockerConfig}.yml`;
              if (this.fs.exists(this.destinationPath(dockerFile))) {
                this.scripts.set(`docker:${dockerConfig}`, `docker-compose -f ${dockerFile} up -d`);
                this.dockerOthers.push(`npm run docker:${dockerConfig}`);
              }
            }
          );
          this.scripts.set('docker:others', this.dockerOthers.join(' && '));
        },
        backend() {
          const javaCommonLog = `-Dlogging.level.ROOT=OFF -Dlogging.level.org.zalando=OFF -Dlogging.level.io.github.jhipster=OFF -Dlogging.level.${this.jhipsterConfig.get(
            'packageName'
          )}=OFF`;

          const buildTool = this.jhipsterConfig.get('buildTool');
          if (buildTool === 'maven') {
            this.scripts.set('backend:info', './mvnw -ntp enforcer:display-info --batch-mode');
            this.scripts.set(
              'backend:test',
              `./mvnw -ntp -P-webpack verify --batch-mode ${javaCommonLog} -Dlogging.level.org.springframework=OFF -Dlogging.level.org.springframework.web=OFF -Dlogging.level.org.springframework.security=OFF`
            );
            this.scripts.set('backend:doc:test', './mvnw -ntp javadoc:javadoc --batch-mode');
            this.scripts.set('java:jar', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE" --batch-mode');
            this.scripts.set('java:war', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE",war --batch-mode');
          } else if (buildTool === 'gradle') {
            this.scripts.set('backend:info', './gradlew -v');
            this.scripts.set(
              'backend:test',
              `./gradlew test integrationTest ${javaCommonLog} -Dlogging.level.org.springframework=OFF -Dlogging.level.org.springframework.web=OFF -Dlogging.level.org.springframework.security=OFF`
            );
            this.scripts.set('backend:doc:test', './gradlew javadoc');
            this.scripts.set('java:jar', './gradlew bootJar -P"$JHI_PROFILE" -x test');
            this.scripts.set('java:war', './gradlew bootWar -P"$JHI_PROFILE" -Pwar -x test');
          }

          // Copy the jar and remove old log and pid
          this.scripts.set(
            'preci:server:start',
            'cp target/*.jar target/e2e.jar && rm target/server.log target/server.pid || true'
          );
          this.scripts.set(
            'ci:server:start',
            `java -jar target/e2e.jar --spring.profiles.active="$JHI_PROFILE" ${javaCommonLog} --logging.level.org.springframework.web=ERROR`
          );
          // Wait the server to be up
          this.scripts.set('ci:server:await', 'wait-on http://localhost:8080');

          if (this.scripts.get('e2e')) {
            if (this.clientFramework.startsWith('angular')) {
              this.scripts.set(
                'ci:e2e:timeout',
                "sed -i -e 's/alertTimeout: 5000/alertTimeout: 1/1;' src/main/webapp/app/core/core.module.ts"
              );
              this.scripts.set('preci:e2e', 'npm run ci:e2e:timeout');
            }

            this.scripts.set(
              'ci:e2e',
              'concurrently -k -s first "npm:ci:server:start" "npm run ci:server:await && npm run e2e"'
            );
            this.scripts.set('e2e:dev', 'concurrently -k -s first "./mvnw" "npm run ci:server:await && npm run e2e"');
          } else {
            this.scripts.set('ci:e2e', 'echo "E2E tests disabled for this application"');
          }

          this.scripts.set('regenerate', 'jhipster --with-entities --skip-install');

          const enableE2E = this.testFrameworks.includes('protractor');
          const githubConfigure = [
            `echo "::set-output name=e2e::${enableE2E}"`,
            `echo "::set-output name=docker_others::${this.dockerOthers.length > 0}"`
          ];
          this.scripts.set('ci:github:configure', githubConfigure.join(' && '));
        }
      };
    }
  };
}

module.exports = {
  createGenerator
};
