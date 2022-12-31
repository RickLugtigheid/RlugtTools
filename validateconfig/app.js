const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    lineNumbers: true,
    tabSize: 2,
    mode: 'properties',
    gutters: ["CodeMirror-lint-markers"],
    lint: { lintOnChange: false }
});

function validator(text, options) {
    document.getElementById('result').style.display = 'none';
    let found = []

    // Check all lines
    //
    let lines = text.split('\n');
    for (let i = 0; i < lines.length; i++)
    {
        // Check the line and push all messages
        //
        checkLine(i, lines[i], message => {
            found.push(message);
        });
    }
    if (found.length == 0)
    {
        document.getElementById('result').style.display = 'unset';
    }
    return found;
}
/**
 * 
 * @param {'Syntax'|'Reference'|'Type'|'Unknown'} type 
 * @param {string} message 
 * @param {number} line 
 * @param {number} colStart 
 * @param {number} colEnd 
 * @returns 
 */
function error(type, message, line, colStart, colEnd)
{
    return {
        message: type + " error on line " + (line+1) + ':\n\n' + message,
        severity: 'error',
        from: CodeMirror.Pos(line, colStart),
        to: CodeMirror.Pos(line, colEnd)
    }
}
/**
 * 
 * @param {string} message 
 * @param {number} line 
 * @param {number} colStart 
 * @param {number} colEnd 
 * @returns 
 */
function warning(message, line, colStart, colEnd)
{
    return {
        message: "Warning on line " + (line+1) + ':\n\n' + message,
        severity: 'warning',
        from: CodeMirror.Pos(line, colStart),
        to: CodeMirror.Pos(line, colEnd)
    }
}
/**
 * 
 * @param {*} index 
 * @param {*} line 
 * @param {(message) => void} messageCallback 
 * @returns 
 */
function checkLine(index, line, messageCallback)
{
    line = line.replace(/\s/g, '');
    console.log(`checkLine(${index}, ${line})`);
    
    if (line == '' || !line)
    {
        return;
    }
    // Ignore comments
    //
    if (line.startsWith(';') || line.startsWith('#'))
        return;
    
    // Check for a header
    //
    if (line.startsWith('['))
    {
        let end = line.indexOf(']')

        // Check if an ']' character was found
        //
        if (end == -1)
        {
            messageCallback(error(
                "Syntax",
                "No end character ']' found",
                index, 0, line.length
            ));
        }
        
        // Check if the header has a name
        //
        if (line.substr(0, end+1) === '[]')
        {
            messageCallback(error(
                "Syntax",
                "No section name given",
                index, 0, end
            ));
        }
    }
    // Else if we do not find a '=' character a invalid keyValue pair is found
    //
    else if (line.indexOf('=') === -1)
    {
        messageCallback(error(
            "Syntax",
            "Invalid keyValue pair",
            index, 0, line.length
        ));
    }
    else
    {
        let assign  = line.indexOf('=');
        let key     = line.substr(0, assign);
        let value   = line.substr(assign+1, line.length);

        // Check if our value is empty
        if (value == '')
        {
            messageCallback(warning(
                "Key '" + key + "' has an empty value",
                index, 0, line.length
            ));
        }

        // Check if our key is empty
        //
        if (key == '')
        {
            messageCallback(error(
                "Syntax",
                "KeyValue pair can not have an empty key",
                index, 0, line.length
            ));
        }
        // Check if our key contains special characters
        //
        if (key.match(/[\?{}\|&~!\[\(\)\^"]/g))
        {
            messageCallback(error(
                "Syntax",
                "Key name can not contain special characters ?{}|&~![()^\"",
                index, 0, line.length
            ));
        }
    }
}
CodeMirror.registerHelper("lint", "properties", validator);