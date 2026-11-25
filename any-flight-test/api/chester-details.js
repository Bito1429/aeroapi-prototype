import { makeDelivery } from "../delivery.mjs";
import { read, rate, alert } from "../read-db.mjs";
export default makeDelivery({read,rate,secret:process.env.ANY_FLIGHT_TEST_KEY,alert})("details");
