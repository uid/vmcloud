var BeliefState = {
	CREATING: 0,
	BOOTING: 1,
	WAIT: 2,
	FREE: 3,
	READY: 4,
	OCCUPIED: 5,
	ERROR: 6,
	KILLING: 7,
	name: function (val) {
		return ['CREATING', 'BOOTING', 'WAIT', 'FREE', 'READY', 'OCCUPIED', 'ERROR', 'KILLING'][val];
	}
};