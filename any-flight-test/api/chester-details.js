import { makeDelivery } from "../delivery.mjs";
import { read } from "../read-db.mjs";
export default makeDelivery({read,secret:process.env.ANY_FLIGHT_TEST_KEY,alert:e=>console.error(JSON.stringify(e))})("details");
