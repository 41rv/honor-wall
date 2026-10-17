import { parse } from "@babel/parser";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const before="/tmp/masar-phase8-before/tests/browser/",after="tests/browser/",checked=[];
for(const name of fs.readdirSync(before).filter(n=>n.endsWith(".ts"))){
 const original=fs.readFileSync(before+name,"utf8"),current=fs.readFileSync(after+name,"utf8"),edits=[];
 const ast=parse(current,{sourceType:"module",plugins:["typescript"]});
 function visit(node){
  if(!node||typeof node!=="object")return;
  if(node.type==="CallExpression"&&node.callee.type==="Identifier"&&node.callee.name==="appUrl"){
   const arg=node.arguments[0];edits.push({start:node.start,end:node.end,value:current.slice(arg.start,arg.end)});
  }
  for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==="object")visit(value);}
 }
 visit(ast);let normalized=current;
 for(const e of edits.sort((a,b)=>b.start-a.start))normalized=normalized.slice(0,e.start)+e.value+normalized.slice(e.end);
 normalized=normalized.replace(/^import \{ appUrl \} from "\.\/url(?:\.ts)?";\n/,"");
 if(name==="habits-phase47-edge.spec.ts") normalized=normalized.replace(`        // The hash updates before React commits the destination and clears the
        // previous search. Start the next search only when that UI is ready.
        await expect(page.locator("main")).toHaveAttribute("data-route", href.slice(1).split("/")[0]);
        await expect(page.getByRole("textbox", { name: "بحث شامل", exact: true })).toHaveValue("");
`, "");
 assert.equal(normalized,original,name+": non-portability change in an existing test");
 checked.push({file:name,urlWrappers:edits.length,baselineSha256:createHash("sha256").update(original).digest("hex")});
}
fs.writeFileSync("docs/habits-phase8/test-portability.json",JSON.stringify({allExistingAssertionsAndJourneysPreservedExactly:true,additionalChecks:["search navigation waits for destination main and cleared input before next query"],files:checked},null,2)+"\n");
console.log("Verified exact preservation of",checked.length,"existing browser files after normalizing URLs and the documented added readiness assertions");
