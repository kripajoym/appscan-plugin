package com.hcl.appscan.jenkins.plugin.scanners;


/**
 * This class is not intended for normal use.  It's sole purpose is for compatibility to convert
 * older build steps to use the Describable Scanner implementations.
 */
public class ScannerFactory implements ScannerConstants {

	/**
	 * Creates a Scanner given a type and target.
	 * @param type
	 * @param target
	 * @return
	 */
	public static Scanner getScanner(String type, String target) {
		return null;
	}
}
