import {LifeOpcode} from './data/life';
import {MoveOpcode} from './data/move';
import {ConditionOpcode} from './data/condition';
import {OperatorOpcode} from './data/operator';
import Indent from './indent';
import {last} from 'lodash';

const TypeSize = {
    'Int8': 1,
    'Uint8': 1,
    'Int16': 2,
    'Uint16': 2,
    'Int32': 4,
    'Uint32': 4,
};

export function parseScript(actor, type, script) {
    const commands = [];
    const opMap = {};
    let indent = 0;
    let offset = 0;
    if (type == 'life' && script.getUint8(offset) != 0x20 && script.getUint8(offset) != 0x00) {
        commands.push({
            name: LifeOpcode[0x20].command,
            indent: 0,
            length: 0,
            args: [0]
        });
        indent++;
    }
    while (offset < script.byteLength) {
        opMap[offset] = commands.length;
        const code = script.getUint8(offset);
        const op = type == 'life' ? LifeOpcode[code] : MoveOpcode[code];
        let cmd;
        if (op) {
            cmd = parseCommand(script, offset, op);
            indent = processIndent(cmd, last(commands), op, indent);
        } else {
            console.warn('Invalid command (', type, ') opcode =', script.getUint8(offset), 'actor =', actor, 'offset =', offset);
            cmd = {
                name: '[INVALID COMMAND]',
                length: 1,
                indent: indent
            };
        }
        commands.push(cmd);
        offset += cmd.length;
    }
    return {
        activeLine: -1,
        opMap: opMap,
        commands: commands
    };
}

function parseCommand(script, offset, op) {
    const cmd = {
        name: op.command,
        length: 1
    };
    parseCondition(cmd, script, offset, op);
    parseArguments(cmd, script, offset, op);
    return cmd;
}

function parseCondition(cmd, script, offset, op) {
    if (op.condition) {
        const code = script.getUint8(offset + cmd.length);
        const condition = ConditionOpcode[code];
        if (condition) {
            cmd.condition = { name: condition.command };
            cmd.length += 1;
            if (condition.param) {
                cmd.condition.param = script.getUint8(offset + cmd.length);
                cmd.length += 1;
            }
            if (op.operator) {
                const code = script.getUint8(offset + cmd.length);
                const operator = OperatorOpcode[code];
                cmd.condition.operator = { name: operator ? operator.command : '?[' + code + ']' };
                cmd.length += 1;
                cmd.condition.operator.operand = script['get' + condition.operand](offset + cmd.length, true);
                cmd.length += TypeSize[condition.operand];
            }
            cmd.length += 2;
        }
    }
}

function parseArguments(cmd, script, offset, op) {
    if (op.args) {
        cmd.args = [];
        for (let i = 0; i < op.args.length; ++i) {
            if (op.args[i][0] == '_') {
                cmd.length += TypeSize[op.args[i].substr(1)];
            } else {
                cmd.args.push(script['get' + op.args[i]](offset + cmd.length, true));
                cmd.length += TypeSize[op.args[i]];
            }
        }
    }
}

function processIndent(cmd, prevCmd, op, indent) {
    switch (op.indent) {
        case Indent.ZERO:
            indent = 0;
            cmd.indent = 0;
            break;
        case Indent.ONE:
            indent = 1;
            cmd.indent = 1;
            break;
        case Indent.ADD:
            cmd.indent = indent;
            indent++;
            break;
        case Indent.SUB:
            indent = Math.max(indent - 1, 0);
            cmd.indent = indent;
            break;
        case Indent.SUB_ADD:
            indent = Math.max(indent - 1, 0);
            cmd.indent = indent;
            indent++;
            break;
        case Indent.SPECIAL_CASE:
            if (prevCmd && prevCmd.name != 'CASE' && prevCmd.name != 'SWITCH') {
                indent = Math.max(indent - 1, 0);
            }
            cmd.indent = indent;
            indent++;
            break;
        case Indent.KEEP:
        default:
            cmd.indent = indent;
            break;
    }
    return indent;
}