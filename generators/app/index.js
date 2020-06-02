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
        scripts() {
          const packageJson = this.createStorage('package.json');
          const devDependencies = packageJson.createStorage('devDependencies');
          devDependencies.set('wait-on', '^5.0.0');
          devDependencies.set('concurrently', '^5.2.0');
          const allDevDependencies = devDependencies.getAll();
          Object.keys(allDevDependencies)
            .filter(field => field.startsWith('generator-jhipster'))
            .forEach(field => {
              devDependencies.delete(field);
            });

          const jhipsterConfig = this.createStorage('.yo-rc.json', 'generator-jhipster');
          const scripts = packageJson.createStorage('scripts');

          const databaseType = jhipsterConfig.get('databaseType');
          if (databaseType === 'sql') {
            const prodDatabaseType = jhipsterConfig.get('prodDatabaseType');
            if (prodDatabaseType === 'no' || prodDatabaseType === 'oracle') {
              scripts.set('docker:db', `echo "Docker for db ${prodDatabaseType} not configured"`);
            } else {
              scripts.set('docker:db', `docker-compose -f src/main/docker/${prodDatabaseType}.yml up -d`);
            }

            scripts.set('ci:test:prepare:docker', 'npm run docker:db');
            scripts.set('ci:e2e:prepare:docker', '');
          } else {
            const dockerFile = `src/main/docker/${databaseType}.yml`;
            if (databaseType === 'couchbase' || databaseType === 'cassandra') {
              scripts.set('ci:test:prepare:docker', `docker-compose -f ${dockerFile} build`);
              scripts.set('docker:db', `docker-compose -f ${dockerFile} up -d`);
              scripts.set('ci:e2e:prepare:docker', 'npm run docker:db');
            } else {
              if (this.fs.exists(this.destinationPath(dockerFile))) {
                scripts.set('docker:db', `docker-compose -f ${dockerFile} up -d`);
              } else {
                scripts.set('docker:db', `echo "Docker for db ${databaseType} not configured"`);
              }

              scripts.set('ci:test:prepare:docker', 'npm run docker:db');
              scripts.set('ci:e2e:prepare:docker', 'npm run docker:db');
            }
          }

          const dockerOthers = [];
          ['keycloak', 'elasticsearch', 'kafka', 'consul', 'redis', 'memcached', 'jhipster-registry'].forEach(
            dockerConfig => {
              const dockerFile = `src/main/docker/${dockerConfig}.yml`;
              if (this.fs.exists(this.destinationPath(dockerFile))) {
                scripts.set(`docker:${dockerConfig}`, `docker-compose -f ${dockerFile} up -d`);
                dockerOthers.push(`npm run docker:${dockerConfig}`);
              }
            }
          );
          scripts.set('docker:others', dockerOthers.join(' && '));

          const javaCommonLog = `-Dlogging.level.ROOT=OFF -Dlogging.level.org.zalando=OFF -Dlogging.level.io.github.jhipster=OFF -Dlogging.level.${jhipsterConfig.get(
            'packageName'
          )}=OFF`;

          const buildTool = jhipsterConfig.get('buildTool');
          if (buildTool === 'maven') {
            scripts.set('backend:info', './mvnw -ntp enforcer:display-info --batch-mode');
            scripts.set(
              'backend:test',
              `./mvnw -ntp -P-webpack verify --batch-mode ${javaCommonLog} -Dlogging.level.org.springframework=OFF -Dlogging.level.org.springframework.web=OFF -Dlogging.level.org.springframework.security=OFF`
            );
            scripts.set('backend:doc:test', './mvnw -ntp javadoc:javadoc --batch-mode');
            scripts.set('java:jar', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE" --batch-mode');
            scripts.set('java:war', './mvnw -ntp verify -DskipTests -P"$JHI_PROFILE",war --batch-mode');
          } else if (buildTool === 'gradle') {
            scripts.set('backend:info', './gradlew -v');
            scripts.set(
              'backend:test',
              `./gradlew test integrationTest ${javaCommonLog} -Dlogging.level.org.springframework=OFF -Dlogging.level.org.springframework.web=OFF -Dlogging.level.org.springframework.security=OFF`
            );
            scripts.set('backend:doc:test', './gradlew javadoc');
            scripts.set('java:jar', './gradlew bootJar -P"$JHI_PROFILE" -x test');
            scripts.set('java:war', './gradlew bootWar -P"$JHI_PROFILE" -Pwar -x test');
          }

          // Copy the jar and remove old log and pid
          scripts.set(
            'preci:server:start',
            'cp target/*.jar target/e2e.jar && rm target/server.log target/server.pid || true'
          );
          scripts.set(
            'ci:server:start',
            `java -jar target/e2e.jar --spring.profiles.active="$JHI_PROFILE" ${javaCommonLog} --logging.level.org.springframework.web=ERROR`
          );
          // Wait the server to be up
          scripts.set('ci:server:await', 'wait-on http://localhost:8080');

          if (scripts.get('e2e')) {
            if (jhipsterConfig.get('clientFramework').startsWith('angular')) {
              scripts.set(
                'ci:e2e:timeout',
                "sed -i -e 's/alertTimeout: 5000/alertTimeout: 1/1;' src/main/webapp/app/core/core.module.ts"
              );
              scripts.set('preci:e2e', 'npm run ci:e2e:timeout');
            }

            scripts.set(
              'ci:e2e',
              'concurrently -k -s first "npm:ci:server:start" "npm run ci:server:await && npm run e2e"'
            );
            scripts.set('e2e:dev', 'concurrently -k -s first "./mvnw" "npm run ci:server:await && npm run e2e"');
          } else {
            scripts.set('ci:e2e', 'echo "E2E tests disabled for this application"');
          }

          scripts.set('regenerate', 'jhipster --with-entities --skip-install');

          const enableE2E = (jhipsterConfig.get('testFrameworks') || []).includes('protractor');
          const githubConfigure = [
            `echo "::set-output name=e2e::${enableE2E}"`,
            `echo "::set-output name=docker_others::${dockerOthers.length > 0}"`
          ];
          scripts.set('ci:github:configure', githubConfigure.join(' && '));
        }
      };
    }
  };
}

module.exports = {
  createGenerator
};
