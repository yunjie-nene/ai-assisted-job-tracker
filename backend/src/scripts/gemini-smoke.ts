import "dotenv/config";
import { parseJobDescription } from "../services/job-parser.js";

const jdText = `
Example Company is hiring a Backend Engineer.
You will build REST APIs using Node.js and TypeScript.
Experience with SQL and automated testing is required.
`;

const job = await parseJobDescription(jdText);

console.log(JSON.stringify(job, null, 2));
