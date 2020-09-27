module.exports = async function(queue, data) {
  if (!Array.isArray(queue)) return data;

  for(const fn of queue) {
    if ('function' !== typeof fn) continue;
    data = await fn(data);
  }

  return data;
};
