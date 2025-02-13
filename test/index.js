const { animasu, event } = require("../dist/index");
const EventEmitter = require("events");
(async () => {
  await animasu.getAnime("okinawa-de-suki-ni-natta-ko-ga-hougen-sugite-tsurasugiru").then(console.log);
 

})();
