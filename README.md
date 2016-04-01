# rabbit-structure visualizer

A web-based tool that allows visualization of a RabbitMQ structure set up by a microservice.

## Why?

At Pipedrive, we have created a uniform JSON based format of declaring exchanges, queues and bindings for microservices that operate with RabbitMQ. We believe this format helps understand the inner logic of each such message queue driven microservice, since it is easy to read and consistent across all services.

This tool helps read this JSON based data and visualize it as a diagram where on the left, there are exchanges and on the right there are queues, bound together by bindings in the middle.

## Licence

MIT.
