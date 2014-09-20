/**
 * @file Parser
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */


NGL.StructureParser = function( name, path ){

    this.name = name;
    this.path = path;

    this.structure = new NGL.Structure( this.name, this.path );

};

NGL.StructureParser.prototype = {

    parse: function( str, callback ){

        this._parse( str, function( structure ){

            structure.postProcess();

            if( typeof callback === "function" ) callback( structure );

        } );

        return this.structure;

    },

    _parse: function( str, callback ){

        console.warn( "NGL.StructureParser._parse not implemented" );

    }

}


NGL.PdbParser = function( name, path ){

    NGL.StructureParser.call( this, name, path );

};

NGL.PdbParser.prototype = Object.create( NGL.StructureParser.prototype );

NGL.PdbParser.prototype._parse = function( str, callback ){

    console.time( "NGL.PdbParser._parse" );

    var s = this.structure;

    s.title = '';
    s.id = '';
    s.sheet = [];
    s.helix = [];

    s.biomolDict = {};
    var biomolDict = s.biomolDict;

    var atoms = s.atoms;
    var bondSet = s.bondSet;

    var lines = str.split( "\n" );

    var guessElem = NGL.guessElement;
    var covRadii = NGL.CovalentRadii;
    var vdwRadii = NGL.VdwRadii;

    var i, j;
    var line, recordName;
    var altloc, serial, elem, chainname, resno, resname, atomname, element;

    var m = s.addModel();
    var c = m.addChain();
    var r = c.addResidue();

    var chainDict = {};
    var serialDict = {};

    var id = s.id;
    var title = s.title;
    var sheet = s.sheet;
    var helix = s.helix;

    s.hasConnect = false;

    var a, currentChainname, currentResno, currentBiomol;

    var n = lines.length;

    var _i = 0;
    var _step = 10000;
    var _n = Math.min( _step, n );

    function _chunked(){

        for( i = _i; i < _n; i++ ){

            line = lines[i];
            recordName = line.substr( 0, 6 );

            if( recordName === 'ATOM  ' || recordName === 'HETATM' ){

                // http://www.wwpdb.org/documentation/format33/sect9.html#ATOM

                altloc = line[ 16 ];
                if( altloc !== ' ' && altloc !== 'A' ) continue; // FIXME: ad hoc

                serial = parseInt( line.substr( 6, 5 ) );
                atomname = line.substr( 12, 4 ).trim();
                element = line.substr( 76, 2 ).trim();
                chainname = line[  21 ];
                resno = parseInt( line.substr( 22, 5 ) );
                resname = line.substr( 17, 4 ).trim();

                if( !a ){

                    c.chainname = chainname;
                    chainDict[ chainname ] = c;

                    r.resno = resno;
                    r.resname = resname;

                    currentChainname = chainname;
                    currentResno = resno;

                }

                if( currentChainname!==chainname ){

                    if( !chainDict[ chainname ] ){

                        c = m.addChain();
                        c.chainname = chainname;

                        chainDict[ chainname ] = c;

                    }else{

                        c = chainDict[ chainname ];

                    }

                }

                if( currentResno!==resno ){

                    r = c.addResidue();
                    r.resno = resno;
                    r.resname = resname;

                }

                if( !element ) element = guessElem( atomname );

                a = r.addAtom();

                serialDict[ serial ] = a;

                a.resname = resname;
                a.x = parseFloat( line.substr( 30, 8 ) );
                a.y = parseFloat( line.substr( 38, 8 ) );
                a.z = parseFloat( line.substr( 46, 8 ) );
                a.element = element;
                a.hetero = ( line[ 0 ] === 'H' ) ? true : false;
                a.chainname = chainname;
                a.resno = resno;
                a.serial = serial;
                a.atomname = atomname;
                a.bonds = [];
                a.ss = 'c';
                a.bfactor = parseFloat( line.substr( 60, 8 ) );
                a.altloc = altloc;
                a.vdw = vdwRadii[ element ];
                a.covalent = covRadii[ element ];

                currentChainname = chainname;
                currentResno = resno;

                atoms.push( a );

            }else if( recordName === 'CONECT' ){

                var from = serialDict[ parseInt( line.substr( 6, 5 ) ) ];
                var pos = [ 11, 16, 21, 26 ];

                for (var j = 0; j < 4; j++) {

                    var to = serialDict[ parseInt( line.substr( pos[ j ], 5 ) ) ];
                    if( to === undefined ) continue;

                    bondSet.addBond( from, to );

                }

                s.hasConnect = true;

            }else if( recordName === 'HELIX ' ){

                var startChain = line[ 19 ];
                var startResi = parseInt( line.substr( 21, 4 ) );
                var endChain = line[ 31 ];
                var endResi = parseInt( line.substr( 33, 4 ) );
                helix.push([ startChain, startResi, endChain, endResi ]);

            }else if( recordName === 'SHEET ' ){

                var startChain = line[ 21 ];
                var startResi = parseInt( line.substr( 22, 4 ) );
                var endChain = line[ 32 ];
                var endResi = parseInt( line.substr( 33, 4 ) );
                sheet.push([ startChain, startResi, endChain, endResi ]);

            }else if( recordName === 'REMARK' && line.substr( 7, 3 ) === '350' ){

                if( line.substr( 11, 12 ) === "BIOMOLECULE:" ){

                    var name = line.substr( 23 ).trim();

                    biomolDict[ name ] = {
                        matrixDict: {},
                        chainList: []
                    };
                    currentBiomol = biomolDict[ name ];

                }else if( line.substr( 13, 5 ) === "BIOMT" ){

                    var row = parseInt( line[ 18 ] ) - 1;
                    var mat = line.substr( 20, 3 ).trim();

                    if( row === 0 ){
                        currentBiomol.matrixDict[ mat ] = new THREE.Matrix4();
                    }

                    var elms = currentBiomol.matrixDict[ mat ].elements;

                    elms[ 4 * 0 + row ] = parseFloat( line.substr( 24, 9 ) );
                    elms[ 4 * 1 + row ] = parseFloat( line.substr( 34, 9 ) );
                    elms[ 4 * 2 + row ] = parseFloat( line.substr( 44, 9 ) );
                    elms[ 4 * 3 + row ] = parseFloat( line.substr( 54, 14 ) );

                }else if(
                    line.substr( 11, 30 ) === 'APPLY THE FOLLOWING TO CHAINS:' ||
                    line.substr( 11, 30 ) === '                   AND CHAINS:'
                ){

                    line.substr( 41, 30 ).split( "," ).forEach( function( v ){

                        currentBiomol.chainList.push( v.trim() )

                    } );

                }

            }else if( recordName === 'HEADER' ){

                id = line.substr( 62, 4 );

            }else if( recordName === 'TITLE ' ){

                title += line.substr( 10, 70 ) + "\n";

            }else if( recordName === 'MODEL ' ){

                if( a ){

                    m = s.addModel();
                    c = m.addChain();
                    r = c.addResidue();
                    a = undefined;

                    chainDict = {};
                    serialDict = {};

                }

            }

        }

        if( _n === n ){

            console.timeEnd( "NGL.PdbParser._parse" );

            _postProcess();
            callback( s );

            // console.log( biomolDict );

        }else{

            _i += _step;
            _n = Math.min( _n + _step, n );

            setTimeout( _chunked );

        }

    }

    function _postProcess(){

        // assign secondary structures

        console.time( "NGL.PdbParser._parse ss" );

        for( j = 0; j < sheet.length; j++ ){

            var selection = new NGL.Selection(
                sheet[j][1] + "-" + sheet[j][3] + ":" + sheet[j][0]
            );

            s.eachResidue( function( r ){

                r.ss = "s";

            }, selection );

        }

        for( j = 0; j < helix.length; j++ ){

            var selection = new NGL.Selection(
                helix[j][1] + "-" + helix[j][3] + ":" + helix[j][0]
            );

            s.eachResidue( function( r ){

                r.ss = "h";

            }, selection );

        }

        console.timeEnd( "NGL.PdbStructure.parse ss" );

        if( sheet.length === 0 && helix.length === 0 ){
            s._doAutoSS = true;
        }

        // check for chain names

        var _doAutoChainName = true;
        s.eachChain( function( c ){
            if( c.chainname && c.chainname !== " " ) _doAutoChainName = false;
        } );
        s._doAutoChainName = _doAutoChainName;

    }

    setTimeout( _chunked );

};


NGL.GroParser = function( name, path ){

    NGL.StructureParser.call( this, name, path );

    this.structure._doAutoSS = true;
    this.structure._doAutoChainName = true;

};

NGL.GroParser.prototype = Object.create( NGL.StructureParser.prototype );

NGL.GroParser.prototype._build = function(){

    var s = this.structure;
    var n = s.atoms.length;

    var i, a;

    var m = s.addModel();
    var c = m.addChain();

    var r = c.addResidue();
    r.resno = s.atoms[ 0 ].resno;
    r.resname = s.atoms[ 0 ].resname;

    var currentResno = s.atoms[ 0 ].resno;

    for( i = 0; i < n; ++i ){

        a = s.atoms[ i ];

        if( currentResno !== a.resno ){

            r = c.addResidue();
            r.resno = a.resno;
            r.resname = a.resname;

        }

        r.addAtom( a );

        currentResno = a.resno;

    }

}

NGL.GroParser.prototype._parse = function( str, callback ){

    console.time( "NGL.GroParser._parse" );

    var s = this.structure;

    var scope = this;

    var atoms = s.atoms;

    var lines = str.trim().split( "\n" );

    var guessElem = NGL.guessElement;
    var covRadii = NGL.CovalentRadii;
    var vdwRadii = NGL.VdwRadii;

    var i, j;
    var line, serial, atomname, element, resno, resname;

    s.title = lines[ 0 ].trim();
    s.size = parseInt( lines[ 1 ] );
    var b = lines[ lines.length-1 ].trim().split( /\s+/ );
    s.box = [
        parseFloat( b[0] ) * 10,
        parseFloat( b[1] ) * 10,
        parseFloat( b[2] ) * 10
    ];

    var atomArray = new NGL.AtomArray( s.size );

    var a;

    var n = lines.length - 1;

    var _i = 2;
    var _step = 10000;
    var _n = Math.min( _step + 2, n );

    function _chunked(){

        for( i = _i; i < _n; i++ ){

            line = lines[i];

            atomname = line.substr( 10, 5 ).trim();
            resno = parseInt( line.substr( 0, 5 ) )
            resname = line.substr( 5, 5 ).trim();

            element = guessElem( atomname );

            a = new NGL.ProxyAtom( atomArray, s.nextAtomIndex() );

            a.resname = resname;
            a.x = parseFloat( line.substr( 20, 8 ) ) * 10;
            a.y = parseFloat( line.substr( 28, 8 ) ) * 10;
            a.z = parseFloat( line.substr( 36, 8 ) ) * 10;
            a.element = element;
            a.resno = resno;
            a.serial = parseInt( line.substr( 15, 5 ) );
            a.atomname = atomname;
            a.ss = 'c';
            a.bonds = [];

            a.vdw = vdwRadii[ element ];
            a.covalent = covRadii[ element ];

            atoms.push( a );

        }

        if( _n === n ){

            console.timeEnd( "NGL.GroParser._parse" );

            scope._build();

            callback( s );

        }else{

            _i += _step;
            _n = Math.min( _n + _step, n );

            setTimeout( _chunked );

        }

    }

    s.atomArray = atomArray;

    setTimeout( _chunked );

};
