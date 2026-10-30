# Go live

Configure the deployment using `.env.example`. Recorded cases can be explored without live providers. Live checks need the associated provider, authentication, verification, and durable storage services to be configured.

## Deployment checks

1. Configure the deployment URL and service integrations.
2. Run lint, type checks, unit tests, and the production build.
3. Run the browser suite against the build using local provider mocks.
4. Verify recorded cases, live availability, error handling, and accessibility on the deployment.

The release gate checks public presentation, production dependency licenses, and asset notices. Review any failures before publishing. Live availability and retention follow the deployment configuration.
