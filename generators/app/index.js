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
          this.scripts = this.packageJson.createStorage('scripts');

          this.jhipsterConfig = this.createStorage('.yo-rc.json', 'generator-jhipster');
          this.baseName = this.jhipsterConfig.get('baseName');
          this.clientFramework = this.jhipsterConfig.get('clientFramework') || 'angular';
          this.testFrameworks = this.jhipsterConfig.get('testFrameworks') || [];
          this.serverPort = this.jhipsterConfig.get('serverPort') || 8080;
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
              this.scripts.set('docker:db', `echo "Docker for db ${prodDatabaseType} not configured for application ${this.baseName}"`);
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
                this.scripts.set('docker:db', `echo "Docker for db ${databaseType} not configured for application ${this.baseName}"`);
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
          const javaTestLog =
            '-Dlogging.level.org.springframework=OFF -Dlogging.level.org.springframework.web=OFF -Dlogging.level.org.springframework.security=OFF';

          this.scripts.set('backend:test', 'npm run ci:backend:test');
          this.scripts.set('backend:doc:test', 'npm run ci:backend:doc:test');
          const buildTool = this.jhipsterConfig.get('buildTool');
          if (buildTool === 'maven') {
            this.scripts.set('backend:info', './mvnw -ntp enforcer:display-info --batch-mode');
            this.scripts.set(
              'ci:backend:test',
              `./mvnw -ntp -P-webpack verify --batch-mode ${javaCommonLog} ${javaTestLog}`
            );
            this.scripts.set('ci:backend:doc:test', './mvnw -ntp javadoc:javadoc --batch-mode');
            this.scripts.set('java:jar', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE" --batch-mode');
            this.scripts.set('java:war', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE",war --batch-mode');
            this.scripts.set('java:docker', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE" jib:dockerBuild');
            // Copy the jar and remove old log and pid
            this.scripts.set('preci:server:start', 'cp target/*.jar app.jar');
          } else if (buildTool === 'gradle') {
            this.scripts.set('ci:backend:test', `./gradlew test integrationTest ${javaCommonLog} ${javaTestLog}`);
            this.scripts.set('backend:info', './gradlew -v');
            this.scripts.set('ci:backend:doc:test', './gradlew javadoc');
            this.scripts.set('java:jar', './gradlew bootJar -P"$JHI_PROFILE" -x test');
            this.scripts.set('java:war', './gradlew bootWar -P"$JHI_PROFILE" -Pwar -x test');
            this.scripts.set('java:docker', './gradlew bootJar -P"$JHI_PROFILE" jibDockerBuild');
            this.scripts.set('preci:server:start', 'cp build/libs/*SNAPSHOT.jar app.jar');
          }

          this.scripts.set(
            'ci:server:start',
            `java -jar app.jar --spring.profiles.active="$JHI_PROFILE" ${javaCommonLog} --logging.level.org.springframework.web=ERROR`
          );

          if (this.scripts.get('e2e')) {
            // Wait the server to be up
            this.scripts.set(
              'ci:server:await',
              `echo "Waiting for server at port ${this.serverPort} to start" && wait-on http://localhost:${this.serverPort} && echo "Server at port ${this.serverPort} started"`
            );
            if (this.clientFramework.startsWith('angular')) {
              this.scripts.set(
                'ci:e2e:timeout',
                "sed -i -e 's/alertTimeout: 5000/alertTimeout: 1/1;' src/main/webapp/app/core/core.module.ts"
              );
              this.scripts.set('preci:e2e:package', 'npm run ci:e2e:timeout');
            }

            this.scripts.set('ci:e2e:package', 'npm run java:jar');
            this.scripts.set('ci:e2e:prepare', '');
            this.scripts.set(
              'ci:e2e:run',
              'concurrently -k -s first "npm:ci:server:start" "npm run ci:server:await && npm run e2e"'
            );
            this.scripts.set('e2e:dev', 'concurrently -k -s first "./mvnw" "npm run ci:server:await && npm run e2e"');
          } else {
            this.scripts.set('ci:server:await', '');
            this.scripts.set('ci:e2e:package', '');
            this.scripts.set('ci:e2e:prepare', '');
            this.scripts.set('ci:e2e:run', `echo "E2E tests disabled for application ${this.baseName}"`);
            this.scripts.set('e2e', `echo "E2E tests disabled for application ${this.baseName}"`);
          }
        },
        github() {
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
