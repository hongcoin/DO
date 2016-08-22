// npm install --save jsonfile
var jsonfile = require('jsonfile');

// npm install --save md5-file
const md5File = require('md5-file');

module.exports = {
  compile : function(helper, file) {
    var outputFile = "compiled/" + file + ".json";
    var md5 = md5File.sync(file);
    console.log("md5: " + md5);
    try {
      var output = jsonfile.readFileSync(outputFile, {throws: false});
      if (output != null && output.md5 == md5) {
        console.log("Loading cached file...");
        return output.compiled;
      } 
      else {
        if (output == null) 
          console.log("No cached file found");
        else if (output.md5 != md5)
          console.log("md5 mismatch: " + output.md5 + " != " + md5);
      }
    }
    catch (e) {
      console.log("Failed to load cached file, compiling from source: " + e);
    }
    console.log("Compiling file...");
    output = helper.compile('./', [file]);
    
    console.log("Caching file...");
    jsonfile.writeFileSync(outputFile, {md5: md5, compiled: output});
    
    return output;
  }
}