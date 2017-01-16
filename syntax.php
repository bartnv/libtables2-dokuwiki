<?php
/**
 * DokuWiki Plugin libtables2 (Syntax Component)
 *
 * @license GPL 2 http://www.gnu.org/licenses/gpl-2.0.html
 * @author  Bart Noordervliet <bart@mmvi.nl>
 */

// must be run within Dokuwiki
if (!defined('DOKU_INC')) die();

require(DOKU_PLUGIN . 'libtables2/libtables2.php');

class syntax_plugin_libtables2 extends DokuWiki_Syntax_Plugin {
    /**
     * @return string Syntax mode type
     */
    public function getType() {
        return 'container';
    }
    /**
     * @return string Paragraph type
     */
    public function getPType() {
        return 'block';
    }
    /**
     * @return int Sort order - Low numbers go before high numbers
     */
    public function getSort() {
        return 55;
    }
    public function getAllowedTypes() {
      return array('formatting', 'substition');
    }

    /**
     * Connect lookup pattern to lexer.
     *
     * @param string $mode Parser mode
     */
    public function connectTo($mode) {
        $this->Lexer->addSpecialPattern('<LT_BLOCK [^>]+>',$mode,'plugin_libtables2');
    }

    /**
     * Handle matches of the libtables2 syntax
     *
     * @param string $match The match of the syntax
     * @param int    $state The state of the handler
     * @param int    $pos The position in the document
     * @param Doku_Handler    $handler The handler
     * @return array Data for the renderer
     */
    public function handle($match, $state, $pos, Doku_Handler &$handler){
        $data = array();
        $data['block'] = substr($match, 10, -1);
        return $data;
    }

    /**
     * Render xhtml output or metadata
     *
     * @param string         $mode      Renderer mode (supported modes: xhtml)
     * @param Doku_Renderer  $renderer  The renderer
     * @param array          $data      The data from the handler() function
     * @return bool If rendering was successful.
     */
    public function render($mode, Doku_Renderer &$renderer, $data) {
        if($mode != 'xhtml') return false;
        $renderer->nocache();
        ob_start();
        Lt2\lt_print_block($data['block']);
        $renderer->doc .= ob_get_contents();
        ob_end_clean();
        return true;
    }
}
