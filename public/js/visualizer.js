d3.json('/example.json', renderStructure);

function renderStructure(err, structure) {
	if (err) throw err;

	var chart = d3
			.select("#chart")
			.html('')
			.append('svg')
			.chart('Sankey'),
		exchangeFmt = _.template('Exchange <%- name %>'),
		queueFmt = _.template('Queue <%- name %>'),
		bindingFmt = _.template('→ <%- routing %> →'),
		deadLetterBindingFmt = _.template('← x-dead-letter-exchange: <%- data["x-dead-letter-exchange"] %> (<%- data["x-message-ttl"] %> ms) ←', { variable: 'data' });

	chart
		.nodeWidth(20)
		.nodePadding(25)
		.iterations(10)
		.spread(true)
		.name(function(n) { return n.name; })
		.colorNodes(function(name, node) {
			if (name && name.toLowerCase().indexOf('queue') > -1) return '#f6b26b';
			if (name && name.toLowerCase().indexOf('→') > -1) return '#9ec4e8';
			if (name && name.toLowerCase().indexOf('x-dead-letter') > -1) return '#f00';
			return '#fff176';
		})
		.colorLinks(function(link) {
			return '#999';
		});

	var nodes = [],
		bindings = [],
		links = [];

	structure.exchanges.forEach(function(exchange, key) {
		exchange.name = exchangeFmt(exchange);
		exchange._index = nodes.push(exchange) - 1;
	});

	structure.queues.forEach(function(queue) {
		queue.name = queueFmt(queue);
		queue._index = nodes.push(queue) - 1;
		if (queue.bindings instanceof Array) {
			queue.bindings.forEach(function(binding) {
				binding._target = queue;
				binding.name = bindingFmt(binding);
				binding._source = _.find(nodes, { name: exchangeFmt({name: binding.exchange}) });
				bindings.push(binding);
				binding._index = nodes.push(binding) - 1;
			});
		}
		if (queue.options && queue.options.arguments && queue.options.arguments['x-dead-letter-exchange']) {
			var deadLetterBinding = {
				_source: _.find(nodes, { name: exchangeFmt({name: queue.options.arguments['x-dead-letter-exchange'] }) }),
				name: deadLetterBindingFmt(queue.options.arguments),
				_target: queue,
				_value: 0.5
			};
			bindings.push(deadLetterBinding);
			deadLetterBinding._index = nodes.push(deadLetterBinding) - 1;
		}
	});

	bindings.forEach(function(binding) {
		// look up source...
		var linkSource = {},
			linkTarget = {};

		if (!binding._source) {
			console.warn('Source not found for binding ' + binding.name);
			return;
		}

		linkSource.source = binding._source._index;
		linkSource.target = binding._index;
		linkSource.value = binding._value || 1;

		// ...and then target
		var targetCandidate = _.find(nodes, { name: binding._target.name });

		if (!targetCandidate || !targetCandidate._index) {
			throw new Error('Target not found for binding ' + binding.name);
		}

		linkTarget.source = binding._index;
		linkTarget.target = targetCandidate._index;
		linkTarget.value = binding._value || 1;

		console.log('Creating a link: ' + binding._source.name + ' --> ' + binding.name + ' --> ' + targetCandidate.name);

		links.push(linkSource);
		links.push(linkTarget);
	});

	var chartData = {
		nodes: nodes,
		links: links
	};

	console.log(chartData);

	nodes.forEach(function(n) {
		console.log(n._index + ': ' + n.name);
	});

	links.forEach(function(n) {
		console.log(n.source + '-->' + n.target);
	});

	chart.draw(chartData);
}