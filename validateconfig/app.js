window.onbeforeunload = function() {
    return 'You have made changes since you last saved, leaving the website will result in a permanent loss of the data.';
};
const MODEL_SAVE = new bootstrap.Modal(document.getElementById('model-save-link'));
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.log('CTRL + S');

        let saveUrl =  new URL(window.location.href);
        saveUrl.hash = encodeURIComponent(editor.getValue());
        document.getElementById('model-save-link-full').value = saveUrl.toString();
        MODEL_SAVE.show();
    }
});

// Enable tooltips
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
});

// Custom data actions
document.querySelectorAll('[data-action="copy-to-clip"]').forEach(element => {

    // Data target is required
    //
    if (!element.hasAttribute('data-target'))
    {
        return;
    }

    element.addEventListener('click', e => {
        let textToCopy = document.querySelector(element.getAttribute('data-target')).value;
        
        // Copy the text inside the text field
        navigator.clipboard.writeText(textToCopy);

        console.log(element.hasAttribute('data-bs-original-title'))
        if (element.hasAttribute('data-bs-original-title'))
        {
            let originalTitle = element.getAttribute('data-bs-original-title');

            element.setAttribute('data-bs-original-title', element.getAttribute('data-success-title'));
            bootstrap.Tooltip.getInstance(element).show(element.getAttribute('data-success-title'));
            element.setAttribute('data-bs-original-title', originalTitle);
        }
    });
});

const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    lineNumbers: true,
    tabSize: 2,
    mode: 'properties',
    gutters: ["CodeMirror-lint-markers"],
    lint: { lintOnChange: false }
});

function addErrorToList(message)
{
    errorLine = document.createElement('p');
    errorLine.className = 'm-2 p-2 ';
    errorLine.className += message.severity == 'warning' ? 'text-warning result-warning' : 'text-danger result-error'
    errorLine.innerText = message.message

    document.getElementById('error-list').appendChild(errorLine);
}

function validator(text, options) {   
    let resultView = document.getElementById('result')
    let successResultView = resultView.getElementsByClassName('result-success')[0];
    let errorResultView = document.getElementById('error-list');
    resultView.style.display = 'none';
    successResultView.style.display = 'none';
    errorResultView.style.display = 'none';
    errorResultView.innerHTML = '';

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
            addErrorToList(message);
        });
    }
    if (found.length == 0)
    {
        successResultView.style.display = '';
    }
    else
    {
        errorResultView.style.display = '';
    }
    document.getElementById('result').style.display = 'unset';
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
const REGEXP_COMMENTS = /^\s*[;#]/;
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
    
    if (line == '' || !line) return;
    // Ignore comments
    //
    if (line.match(REGEXP_COMMENTS)) return;
    
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
        // Check if our section has something after the end ']' that is not a comment
        //
        else
        {
            var endText = line.substr(end+1, line.length);
            if (endText != '' && !endText.match(REGEXP_COMMENTS))
            {
                messageCallback(error(
                    "Syntax",
                    "No content after end character ']' expected",
                    index, ++end, ++end + endText.length
                ));
            }
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
        let specials = /[\?{}\|&~!\[\(\)\^"]/g;
        // Check if our key is an array
        //
        if (key.endsWith('[]'))
        {
            messageCallback(warning(
                "Arrays may not be supported by the parser you are using.",
                index, 0, key.length
            ));
            // Remove the [] so we don't get an error
            specials = /[\?{}\|&~!\(\)\^"]/g;
        }
        // Check if our key contains special characters
        //
        if (key.match(specials))
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