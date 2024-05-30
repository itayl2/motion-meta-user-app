# motion-meta-user-app

This is a simple application meant to fetch basic user information from Meta's /me endpoint based on a given access token.

## Installation

- `npm install .`
- `npm run build`

## Usage
- Copy `.env.example` to `.env` and fill in the required values.
- In `.env`, set your access token under `META_ACCESS_TOKEN`
- Run `npm run start` to start the application.
- Run `npm run test` to run the tests.

### Demo
- Credentials population: For the purpose of the demo, when the application starts it populates the credentials based on the aforementioned environment variable, and associates it with the mocked customer for whom the data is being polled.
- `SERVICES_META_USER_CONCURRENT_REQUESTS`: To force the service to exceed Meta's rate limit and get throttled, set this environment variable to some exceptional value like 100 or 1000. Its default value is 1 (i.e normal operations). This environment variable is only for the purpose of this demo.


## Main Components
### App
#### App Handler (`AppHandler`)
- Main entry point of the application. 
- Initializes all required components and starts the service (which runs on interval by default). 
- Serves as an entry point for a request or event to trigger the service on demand as well (see below)

##### Lambda Handler (?)
To support operation in a serverless environment, it would involve some changes to the container initialization to handle statelessness and cold starts. Since initialization is minor in this application, statelessness can be easily implemented, and would ideally be used in batching, wherein each time the Lambda is triggered, it receives a batch of customers / entities to handle. So we could for example:
- Submit an array of customer names every 2s via an AWS EventBridge Event
- The event triggers them all as separate instances of `MetaUserService.runOnce()`
- Awaits `Promise.all()` for all of them
- Event handling ends

This however depends on the amount of customers and interval.
If we end up running it too often, it makes more sense (costs, operations) to run a normal, stateful environment.

The same principle applies to stateful environments; we would trigger the operation via AppHandler.handleRequest() on demand as web server / cronjob.


### Config
Config is loaded based on environment variables with fallback values.
The config allows for easy, no-code changes to the application's behavior, such as:
- How rate limiting is identified
- How rate limiting is handled
- How retries are handled per platform (e.g Meta), and per endpoint of platform (e.g /me). Endpoint config is optional and is merged based on platform config.

#### Dot Env (.env)
- Used to load environment variables from a `.env` file for local development.
- See sample at `.env.sample`

### Storage
#### DynamoDB (`DynamoDBClient`)
- Used for fetching customer data from the database.
- Currently, mocked to keep this demo implementation short, so it always returns a customer called `motion_test_user`.

#### Redis (`CacheStorage`)
- Caching credentials
- Locks to moderate requests globally in response to rate limiting
- Mocked to keep this demo implementation short. Mocked without `redis-mock` due to its specific implementation and capabilities, and without `redis-memory-server` due to its limitations on Windows (which may be the target machine of the Motion developer)

#### Secrets Manager (`SecretsManager`)
- Used for fetching the credentials based on customer name from AWS Secrets Manager.
- Currently, mocked to keep this demo implementation short.


#### Credentials Manager (`CredentialsManager`)
- Utilizes Redis & Secrets Manager to fetch and store credentials in memory.

The state of the credentials is managed by Redis, so that we can:
- Expire credentials after a certain amount of time after having replaced them in Secrets Manager (allowing for rotation)
- Expire credentials of deleted / disabled customers

It fetches the credentials via Secrets Manager when it is either missing from memory or when it is expired according to Redis, and then stores it in memory.

This design of Credentials Manager operation enables us to have the credentials managed by a separate service in a microservices architecture; a service which would populate Secrets Manager and expire / remove keys in Redis, thus prompting this application to re-fetch from AWS Secrets before issuing a request.

### Request Management (`RequestManager`)
#### Meta Request Management (`MetaRequestManager` implements `RequestManager`)
- Executes the Axios request needed to fetch the data from a given endpoint based on a given config. 
- Includes error handling and self & & global moderation in response to rate limiting. 
- Uses a pair of locks to moderate requests per customer, supports multi-instance implementation.


### Agent (`MetaUserAgent`)
- Per platform and area of responsibility, we have an agent that is responsible for fetching the data from the endpoint. 
- It utilizes the `MetaRequestManager` to fetch the data from the endpoint based on the configurations it holds.


### Service (`Service`)
#### Meta User Service (`MetaUserService` implements `Service`)
- Runs on interval and on demand, to have the user data fetched and stored in DynamoDB. 
- Utilizes `MetaUserAgent` to fetch the data from the endpoint and `DynamoDBClient` to store the data in the database.


### TODO
#### Major: Things I would normally implement in a non-demo scenario and should be handled first
- Docker: Create a Dockerfile to prepare this application to run in a containerized environment.
- Metrics: Implement Prometheus metrics in the various "TODO" lines across the code. Normally these lines would be replaced by work tickets with details, but for the purposes of this demo they were left there to clarify where metrics would be used.
- Redis: Mocked for this demo using a map, but in a real-world scenario it would be replaced with a real Redis instance (or at least a local-stack)
- DynamoDB: The data is currently mocked, but in a real-world scenario it would be replaced with a real DynamoDB table & client (or at least a local-stack)
- Secrets Manager: The data is currently mocked, but in a real-world scenario it would be replaced with an aws-sdk client for AWS Secrets Manager
- Tests: Add more tests to increase coverage:
  - `MetaUserService`: starting & stopping, concurrent tasks, validating results transformation and in DB
  - `MetaUserAgent`: granular error handling, the various versions of rate limiting headers that Meta supports
- Error Handling: Need to consult Motion on importance and details of some error scenarios in `MetaErrorHandler`:
  - Stability Codes from Meta
  - Check for more indications of rate limiting
  - Find examples for Meta sub-codes: Mentioned [here](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/) but no examples found
  - Per Motion requirements, handle sensitive data in error logs


#### Minor: Tweaks and extra information or changes that would are "nice to have"
- Consult Motion whether we want to slow down per app usage stats by Meta even before throttling. If so, requires some business logic and numbers.
- Consult Motion about how rate limiting affects the application - how many tokens do we have, is it one per customer, one per app, one per area of the company, etc. This affects how we want to moderate our behavior to handle / avoid throttling.
- Add validation (Joi?) for bodies and headers returned by Meta, to ensure we're not missing any fields or getting unexpected values.
- Find examples of sub codes by Meta
- A few other minor TODOs mentioned in the code not currently important enough to mention in this readme of this demo.
- Fix all relative paths to `@/` instead of `../../` and others, including the built code. Didn't have time to handle my environment for this.
