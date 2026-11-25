import { makeDelivery } from "../delivery.mjs";
import { read, rate } from "../read-db.mjs";
export default makeDelivery({read,rate,secret:process.env.ANY_FLIGHT_TEST_KEY,alert:e=>console.error(JSON.stringify(e))})("search");
